import { randomBytes, randomInt, createHash } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import type { getDatabase } from '../../lib/database.js';
import { oauthLoginTickets, otpCodes, refreshTokens, users } from '../../db/schema/index.js';
import { AppError, UnauthorizedError } from '../../lib/errors.js';
import { getSmsProvider } from '../../lib/sms/index.js';
import { getEnv } from '../../config/env.js';
import {
  OTP_LOCKOUT_WINDOW_MINUTES,
  OTP_MAX_ATTEMPTS_PER_CODE,
  OTP_TTL_MINUTES,
  hashOtpCode,
  isOtpLockedOut,
  otpHashesMatch,
} from './otp-policy.js';

type Database = ReturnType<typeof getDatabase>;

function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Guesses recorded against this phone (across every code it was sent) in the
 *  lockout window. */
async function countRecentOtpAttempts(db: Database, phone: string): Promise<number> {
  const since = new Date(Date.now() - OTP_LOCKOUT_WINDOW_MINUTES * 60_000);
  const [row] = await db
    .select({ attempts: sql<number>`coalesce(sum(${otpCodes.attempts}), 0)::int` })
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), gt(otpCodes.createdAt, since)));
  return row?.attempts ?? 0;
}

async function assertNotLockedOut(db: Database, phone: string): Promise<void> {
  if (isOtpLockedOut(await countRecentOtpAttempts(db, phone))) {
    throw new AppError(
      'Too many incorrect codes for this number. Try again in a few minutes.',
      429,
      'OTP_TEMPORARILY_LOCKED',
    );
  }
}

export async function requestOtp(db: Database, phone: string): Promise<{ code: string }> {
  // A phone that has burned its guess budget can't just ask for fresh codes
  // (each new code would otherwise reset the per-code attempt counter).
  await assertNotLockedOut(db, phone);

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
  const codeHash = hashOtpCode(getEnv().JWT_SECRET, phone, code);

  // Exactly one live code per phone: a new request kills every earlier
  // still-valid code, so "resend" can never multiply the number of codes an
  // attacker's guess could match.
  await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt)));
  await db.insert(otpCodes).values({ phone, codeHash, expiresAt });
  await getSmsProvider().sendOtp(phone, code);
  return { code };
}

async function findOrCreateUser(db: Database, phone: string) {
  const existing = await db.query.users.findFirst({ where: eq(users.phone, phone) });
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({ phone, fullName: `Utilisateur ${phone.slice(-4)}` })
    .returning();
  if (!created) throw new Error('Failed to create user');
  return created;
}

/** Shared by sign-in (verifyOtpAndIssueTokens) and attaching a phone to an
 *  already-authenticated user (users.service.ts's attachPhoneToUser) —
 *  the code-validity check and single-use consumption are identical in
 *  both cases; only what happens *after* a valid code differs. */
export async function consumeValidOtp(db: Database, phone: string, code: string): Promise<void> {
  await assertNotLockedOut(db, phone);

  // The single live code for this phone (requestOtp kills all earlier ones).
  const candidate = await db.query.otpCodes.findFirst({
    where: and(
      eq(otpCodes.phone, phone),
      isNull(otpCodes.consumedAt),
      gt(otpCodes.expiresAt, new Date()),
    ),
    orderBy: desc(otpCodes.createdAt),
  });
  if (!candidate) {
    throw new UnauthorizedError('Invalid or expired code');
  }

  // Reserve a guess BEFORE comparing, atomically in the UPDATE's own WHERE
  // clause: N concurrent requests can therefore never collectively make more
  // than OTP_MAX_ATTEMPTS_PER_CODE comparisons against this code (a
  // read-check-then-increment would let them all pass the check together).
  const [reserved] = await db
    .update(otpCodes)
    .set({ attempts: sql`${otpCodes.attempts} + 1` })
    .where(
      and(
        eq(otpCodes.id, candidate.id),
        isNull(otpCodes.consumedAt),
        lt(otpCodes.attempts, OTP_MAX_ATTEMPTS_PER_CODE),
      ),
    )
    .returning({ id: otpCodes.id });
  if (!reserved) {
    throw new UnauthorizedError('Invalid or expired code');
  }

  const providedHash = hashOtpCode(getEnv().JWT_SECRET, phone, code);
  if (!otpHashesMatch(candidate.codeHash, providedHash)) {
    throw new UnauthorizedError('Invalid or expired code');
  }

  // Single-use, atomically: two concurrent verifies with the same correct
  // code used to both find it unconsumed and both succeed (replay). Only the
  // request whose UPDATE actually flips consumed_at wins.
  const [consumed] = await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.id, candidate.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });
  if (!consumed) {
    throw new UnauthorizedError('Invalid or expired code');
  }
}

export async function verifyOtpAndIssueTokens(
  db: Database,
  phone: string,
  code: string,
  signAccessToken: (userId: string) => string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  await consumeValidOtp(db, phone, code);
  const user = await findOrCreateUser(db, phone);
  return issueTokens(db, user.id, signAccessToken);
}

export async function issueTokens(
  db: Database,
  userId: string,
  signAccessToken: (userId: string) => string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const env = getEnv();
  const refreshTokenPlain = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(refreshTokenPlain),
    expiresAt,
  });

  return {
    accessToken: signAccessToken(userId),
    refreshToken: refreshTokenPlain,
    expiresIn: env.JWT_ACCESS_TTL_SEC,
  };
}

export async function refreshAccessToken(
  db: Database,
  refreshTokenPlain: string,
  signAccessToken: (userId: string) => string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const tokenHash = hashToken(refreshTokenPlain);
  const record = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      isNull(refreshTokens.revokedAt),
      gt(refreshTokens.expiresAt, new Date()),
    ),
  });

  if (!record) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const env = getEnv();
  return { accessToken: signAccessToken(record.userId), expiresIn: env.JWT_ACCESS_TTL_SEC };
}

export async function revokeRefreshToken(db: Database, refreshTokenPlain: string): Promise<void> {
  const tokenHash = hashToken(refreshTokenPlain);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, tokenHash));
}

/** Revokes every still-live refresh token for a user in one pass — used on
 *  account deletion (users.service.ts's deleteUser), where every existing
 *  session must stop working immediately, not just the one the deletion
 *  request came in on. */
export async function revokeAllRefreshTokensForUser(db: Database, userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

interface GoogleProfile {
  googleId: string;
  email?: string;
  /** Google's own `email_verified` claim for `email`. */
  emailVerified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * How a verified Google identity maps onto an existing VAYA account, as a
 * pure decision (unit-tested without a DB):
 *
 *  - The email is only trusted when Google says it is verified. Google can
 *    return an id_token with `email_verified: false` (e.g. a Google account
 *    registered against a third-party address nobody confirmed) — treating
 *    such an email as proof of identity let anyone claim a VAYA account just
 *    by asserting its owner's email address.
 *  - An account that is already bound to a *different* Google identity is
 *    never re-bound. Linking used to overwrite `google_id` unconditionally,
 *    so the attacker's Google account silently replaced the real owner's.
 */
export type GoogleLinkDecision =
  | { action: 'create'; storeEmail: boolean }
  | { action: 'link'; existingUserId: string }
  | { action: 'reject'; reason: 'EMAIL_BOUND_TO_OTHER_GOOGLE_ACCOUNT' };

export function decideGoogleAccountLink(
  profile: Pick<GoogleProfile, 'email' | 'emailVerified'>,
  existingByEmail: { id: string; googleId: string | null } | undefined,
): GoogleLinkDecision {
  const emailTrusted = Boolean(profile.email) && profile.emailVerified === true;
  if (!emailTrusted) {
    // No verified email: never link, never claim the (unique) email column.
    return { action: 'create', storeEmail: false };
  }
  if (!existingByEmail) return { action: 'create', storeEmail: true };
  if (existingByEmail.googleId) {
    return { action: 'reject', reason: 'EMAIL_BOUND_TO_OTHER_GOOGLE_ACCOUNT' };
  }
  return { action: 'link', existingUserId: existingByEmail.id };
}

/**
 * Confidential-client Authorization Code exchange, done server-side with the
 * client secret (never shipped to the mobile app). Verifying the returned
 * id_token (not just trusting the token endpoint's 200) is what actually
 * proves the profile came from Google for this exact client id.
 */
async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
    throw new AppError('Google sign-in is not configured', 501, 'GOOGLE_AUTH_NOT_CONFIGURED');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    // Google's token endpoint error body is a short, non-secret OAuth error
    // code (e.g. `redirect_uri_mismatch`, `invalid_client`, `invalid_grant`)
    // — surfacing it (as the AppError `code`, never the raw body) is what
    // actually makes a misconfigured GOOGLE_CALLBACK_URL/CLIENT_SECRET in a
    // deployed environment diagnosable from the app itself, without needing
    // direct server log access.
    const errorBody = (await tokenResponse.json().catch(() => null)) as {
      error?: string;
    } | null;
    const googleError = errorBody?.error ?? 'unknown';
    throw new AppError(
      `Google token exchange failed: ${googleError}`,
      401,
      `GOOGLE_TOKEN_${googleError.toUpperCase()}`,
    );
  }

  const tokenJson = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenJson.id_token) {
    throw new AppError('Google token response missing id_token', 401, 'GOOGLE_NO_ID_TOKEN');
  }

  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken: tokenJson.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new AppError('Google id_token missing sub claim', 401, 'GOOGLE_INVALID_ID_TOKEN');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name,
    picture: payload.picture,
  };
}

async function findOrCreateGoogleUser(db: Database, profile: GoogleProfile) {
  const existingByGoogleId = await db.query.users.findFirst({
    where: eq(users.googleId, profile.googleId),
  });
  if (existingByGoogleId) return existingByGoogleId;

  // Link, don't duplicate: a phone/OTP account with the same *verified* email
  // is the same person signing in through a second door — but see
  // decideGoogleAccountLink for the two cases where that must not happen.
  const existingByEmail =
    profile.email && profile.emailVerified
      ? await db.query.users.findFirst({ where: eq(users.email, profile.email) })
      : undefined;
  const decision = decideGoogleAccountLink(profile, existingByEmail);
  if (decision.action === 'reject') {
    throw new AppError(
      'This email is already linked to a different Google account',
      409,
      'GOOGLE_EMAIL_ALREADY_LINKED',
    );
  }
  if (decision.action === 'link') {
    // `google_id IS NULL` in the WHERE makes the link itself race-safe: if a
    // concurrent request bound a Google identity between our read and this
    // write, this updates zero rows instead of overwriting it.
    const [linked] = await db
      .update(users)
      .set({ googleId: profile.googleId, updatedAt: new Date() })
      .where(and(eq(users.id, decision.existingUserId), isNull(users.googleId)))
      .returning();
    if (!linked) {
      throw new AppError(
        'This email is already linked to a different Google account',
        409,
        'GOOGLE_EMAIL_ALREADY_LINKED',
      );
    }
    return linked;
  }

  const [created] = await db
    .insert(users)
    .values({
      email: decision.storeEmail ? profile.email : undefined,
      googleId: profile.googleId,
      authProvider: 'google',
      fullName: profile.name?.trim() || 'Utilisateur VAYA',
      avatarUrl: profile.picture,
    })
    .returning();
  if (!created) throw new Error('Failed to create user');
  return created;
}

/** Resolves a Google authorization code to a real user, creating or linking one as needed. */
export async function loginWithGoogleCode(db: Database, code: string): Promise<string> {
  const profile = await exchangeGoogleCode(code);
  const user = await findOrCreateGoogleUser(db, profile);
  return user.id;
}

const OAUTH_TICKET_TTL_MS = 2 * 60_000;

/**
 * The OAuth callback can only respond with an HTTP redirect (it's a browser
 * navigation, not a fetch from the app), so it hands the app a short-lived,
 * single-use ticket via a deep link instead of session tokens directly —
 * tokens never appear in a URL/redirect history.
 */
export async function issueOauthTicket(db: Database, userId: string): Promise<string> {
  const ticketPlain = randomBytes(32).toString('hex');
  await db.insert(oauthLoginTickets).values({
    userId,
    ticketHash: hashToken(ticketPlain),
    expiresAt: new Date(Date.now() + OAUTH_TICKET_TTL_MS),
  });
  return ticketPlain;
}

export async function consumeOauthTicket(db: Database, ticketPlain: string): Promise<string> {
  const ticketHash = hashToken(ticketPlain);
  const record = await db.query.oauthLoginTickets.findFirst({
    where: and(
      eq(oauthLoginTickets.ticketHash, ticketHash),
      isNull(oauthLoginTickets.consumedAt),
      gt(oauthLoginTickets.expiresAt, new Date()),
    ),
  });

  if (!record) {
    throw new UnauthorizedError('Invalid or expired ticket');
  }

  await db
    .update(oauthLoginTickets)
    .set({ consumedAt: new Date() })
    .where(eq(oauthLoginTickets.id, record.id));

  return record.userId;
}
