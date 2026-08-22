import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, oauthLoginTickets } from '../../../db/schema/index.js';
import {
  loginWithGoogleCode,
  issueOauthTicket,
  consumeOauthTicket,
} from '../auth.service.js';

// google-auth-library does a real network call to fetch Google's JWKS to
// verify an id_token's signature — not something a unit/integration test
// should depend on. Mocking it here isolates exactly what this module owns:
// the account-linking/creation and ticket logic, not Google's own crypto.
let mockPayload: { sub: string; email?: string; name?: string; picture?: string } | null = null;

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn().mockImplementation(async () => ({
      getPayload: () => mockPayload,
    })),
  })),
}));

/**
 * Real Postgres, real service functions — only the two calls that would
 * otherwise hit Google's servers (the token exchange fetch + JWKS-backed
 * id_token verification) are stubbed. Everything downstream of "here is a
 * verified Google profile" (account creation, email-based linking to an
 * existing phone/OTP account, duplicate-user prevention, and the single-use
 * ticket handoff the OAuth callback hands the mobile app) is exercised for
 * real, matching the discipline the rest of this codebase's integration
 * suites already use (see bookings-notifications.integration.test.ts).
 */
describe('Google auth (auth.service)', () => {
  const db = getDatabase();
  const createdUserIds: string[] = [];
  const base = Date.now() % 10_000_000;

  beforeEach(() => {
    mockPayload = null;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id_token: 'fake-id-token' }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(oauthLoginTickets).where(eq(oauthLoginTickets.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
    await closeDatabase();
  });

  it('creates a new user on first Google sign-in, with no phone required', async () => {
    mockPayload = {
      sub: `google-sub-${base}-1`,
      email: `newgoogle${base}@example.com`,
      name: 'New Googler',
      picture: 'https://example.com/avatar.png',
    };

    const userId = await loginWithGoogleCode(db, 'auth-code-1');
    createdUserIds.push(userId);

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(user).toBeDefined();
    expect(user!.phone).toBeNull();
    expect(user!.email).toBe(mockPayload.email);
    expect(user!.googleId).toBe(mockPayload.sub);
    expect(user!.authProvider).toBe('google');
    expect(user!.fullName).toBe('New Googler');
  });

  it('does not create a duplicate user for a repeat sign-in with the same Google account', async () => {
    mockPayload = {
      sub: `google-sub-${base}-2`,
      email: `repeat${base}@example.com`,
      name: 'Repeat Googler',
    };

    const firstUserId = await loginWithGoogleCode(db, 'auth-code-2a');
    createdUserIds.push(firstUserId);

    const secondUserId = await loginWithGoogleCode(db, 'auth-code-2b');
    expect(secondUserId).toBe(firstUserId);

    const matches = await db.query.users.findMany({ where: eq(users.googleId, mockPayload.sub) });
    expect(matches).toHaveLength(1);
  });

  it('links an existing phone/OTP account instead of creating a second one when emails match', async () => {
    const sharedEmail = `linked${base}@example.com`;
    const [phoneUser] = await db
      .insert(users)
      .values({ phone: `+216${base}9`, email: sharedEmail, fullName: 'Phone First' })
      .returning();
    createdUserIds.push(phoneUser!.id);

    mockPayload = { sub: `google-sub-${base}-3`, email: sharedEmail, name: 'Phone First (Google)' };
    const linkedUserId = await loginWithGoogleCode(db, 'auth-code-3');

    expect(linkedUserId).toBe(phoneUser!.id);
    const updated = await db.query.users.findFirst({ where: eq(users.id, phoneUser!.id) });
    expect(updated!.googleId).toBe(mockPayload.sub);
    expect(updated!.phone).toBe(phoneUser!.phone); // phone/OTP identity preserved, not overwritten
  });

  it('rejects sign-in when Google returns no id_token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    await expect(loginWithGoogleCode(db, 'auth-code-bad')).rejects.toThrow();
  });

  it('rejects sign-in when the token endpoint itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(loginWithGoogleCode(db, 'auth-code-bad-2')).rejects.toThrow();
  });

  describe('oauth login tickets', () => {
    let userId: string;

    beforeEach(async () => {
      const [user] = await db
        .insert(users)
        .values({ phone: `+216${base}${Math.floor(Math.random() * 1000)}`, fullName: 'Ticket Owner' })
        .returning();
      userId = user!.id;
      createdUserIds.push(userId);
    });

    it('round-trips: issued ticket resolves to the same user id exactly once', async () => {
      const ticket = await issueOauthTicket(db, userId);
      const resolved = await consumeOauthTicket(db, ticket);
      expect(resolved).toBe(userId);

      await expect(consumeOauthTicket(db, ticket)).rejects.toThrow();
    });

    it('rejects an unknown ticket', async () => {
      await expect(consumeOauthTicket(db, 'not-a-real-ticket')).rejects.toThrow();
    });

    it('rejects an expired ticket', async () => {
      const ticket = await issueOauthTicket(db, userId);
      // Force it into the past directly — the same technique otpCodes tests
      // would use, since there's no way to fast-forward server time cleanly.
      await db
        .update(oauthLoginTickets)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(oauthLoginTickets.userId, userId));

      await expect(consumeOauthTicket(db, ticket)).rejects.toThrow();
    });
  });
});
