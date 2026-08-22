import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, otpCodes } from '../../../db/schema/index.js';
import { attachPhoneToUser } from '../users.service.js';

/**
 * Real Postgres — covers the actual gap this closes: a Google-signed-in user
 * (no phone at all) adding and OTP-verifying a phone number without it
 * creating a second account or letting them steal someone else's number.
 */
describe('attachPhoneToUser', () => {
  const db = getDatabase();
  const createdUserIds: string[] = [];
  const base = Date.now() % 10_000_000;

  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await closeDatabase();
  });

  async function seedGoogleUser(suffix: string) {
    const [user] = await db
      .insert(users)
      .values({
        email: `attach-${suffix}-${base}@example.com`,
        googleId: `google-${suffix}-${base}`,
        authProvider: 'google',
        fullName: 'Google User',
      })
      .returning();
    createdUserIds.push(user!.id);
    return user!;
  }

  async function seedValidCode(phone: string, code: string) {
    await db.insert(otpCodes).values({
      phone,
      code,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
  }

  it('attaches a verified phone to a phone-less Google account', async () => {
    const user = await seedGoogleUser('a');
    const phone = `+216${base}1`;
    await seedValidCode(phone, '111111');

    const updated = await attachPhoneToUser(db, user.id, phone, '111111');
    expect(updated.phone).toBe(phone);

    const reloaded = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(reloaded!.phone).toBe(phone);
  });

  it('rejects an invalid/expired code without touching the user row', async () => {
    const user = await seedGoogleUser('b');
    const phone = `+216${base}2`;

    await expect(attachPhoneToUser(db, user.id, phone, '000000')).rejects.toThrow();

    const reloaded = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(reloaded!.phone).toBeNull();
  });

  it('rejects (409) attaching a phone that already belongs to a different user', async () => {
    const owner = await seedGoogleUser('c-owner');
    const claimant = await seedGoogleUser('c-claimant');
    const phone = `+216${base}3`;
    await seedValidCode(phone, '222222');
    await attachPhoneToUser(db, owner.id, phone, '222222');

    await seedValidCode(phone, '333333');
    await expect(attachPhoneToUser(db, claimant.id, phone, '333333')).rejects.toMatchObject({
      statusCode: 409,
    });

    const reloadedClaimant = await db.query.users.findFirst({ where: eq(users.id, claimant.id) });
    expect(reloadedClaimant!.phone).toBeNull();
  });

  it('consumes the code so it cannot be reused (single-use, same as sign-in OTP)', async () => {
    const userA = await seedGoogleUser('d1');
    const userB = await seedGoogleUser('d2');
    const phone = `+216${base}4`;
    await seedValidCode(phone, '444444');

    await attachPhoneToUser(db, userA.id, phone, '444444');

    const otherPhone = `+216${base}5`;
    await expect(attachPhoneToUser(db, userB.id, otherPhone, '444444')).rejects.toThrow();
  });
});
