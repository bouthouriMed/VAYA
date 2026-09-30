import { describe, it, expect, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { otpCodes } from '../../../db/schema/index.js';
import { consumeValidOtp, requestOtp } from '../auth.service.js';
import { OTP_MAX_ATTEMPTS_PER_CODE, OTP_MAX_ATTEMPTS_PER_WINDOW } from '../otp-policy.js';

// Keep the SMS provider a no-op regardless of local Twilio credentials.
vi.mock('../../../lib/sms/index.js', () => ({
  getSmsProvider: () => ({ sendOtp: async () => {} }),
}));

/**
 * Real Postgres — VAYA-SEC-002. Covers the DB-level guarantees the pure
 * otp-policy unit tests cannot: hashed storage, one live code per phone,
 * per-code and per-window guess budgets, and atomic single use.
 */
describe('OTP hardening (auth.service)', () => {
  const db = getDatabase();
  const base = 30_000_000 + (Date.now() % 10_000_000);
  const phones: string[] = [];
  const freshPhone = () => {
    const phone = `+216${String(base + phones.length).padStart(8, '0')}`;
    phones.push(phone);
    return phone;
  };

  afterAll(async () => {
    for (const phone of phones) await db.delete(otpCodes).where(eq(otpCodes.phone, phone));
    await closeDatabase();
  });

  it('never stores the code in plaintext', async () => {
    const phone = freshPhone();
    const { code } = await requestOtp(db, phone);
    const rows = await db.query.otpCodes.findMany({ where: eq(otpCodes.phone, phone) });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows[0])).not.toContain(code);
  });

  it('accepts the right code exactly once, even under concurrent replay', async () => {
    const phone = freshPhone();
    const { code } = await requestOtp(db, phone);
    const results = await Promise.allSettled([
      consumeValidOtp(db, phone, code),
      consumeValidOtp(db, phone, code),
      consumeValidOtp(db, phone, code),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('a new request invalidates every earlier code for that phone', async () => {
    const phone = freshPhone();
    const first = await requestOtp(db, phone);
    const second = await requestOtp(db, phone);
    // (A collision between two random 6-digit codes would make this vacuous.)
    if (first.code !== second.code) {
      await expect(consumeValidOtp(db, phone, first.code)).rejects.toThrow(/invalid or expired/i);
    }
    await expect(consumeValidOtp(db, phone, second.code)).resolves.toBeUndefined();
  });

  it('kills a code after its per-code guess budget, even if the right code follows', async () => {
    const phone = freshPhone();
    const { code } = await requestOtp(db, phone);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < OTP_MAX_ATTEMPTS_PER_CODE; i += 1) {
      await expect(consumeValidOtp(db, phone, wrong)).rejects.toMatchObject({ statusCode: 401 });
    }
    await expect(consumeValidOtp(db, phone, code)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('locks the phone out (429) once the per-window budget is spent, and refuses fresh codes', async () => {
    const phone = freshPhone();
    let wrong = '000000';
    for (let round = 0; round * OTP_MAX_ATTEMPTS_PER_CODE < OTP_MAX_ATTEMPTS_PER_WINDOW; round += 1) {
      const { code } = await requestOtp(db, phone);
      wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < OTP_MAX_ATTEMPTS_PER_CODE; i += 1) {
        await consumeValidOtp(db, phone, wrong).catch(() => undefined);
      }
    }
    await expect(consumeValidOtp(db, phone, wrong)).rejects.toMatchObject({ statusCode: 429 });
    await expect(requestOtp(db, phone)).rejects.toMatchObject({ statusCode: 429 });
  });
});
