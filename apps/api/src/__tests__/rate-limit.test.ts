import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { getDatabase, closeDatabase } from '../lib/database.js';
import { otpCodes } from '../db/schema/index.js';

describe('Rate limiting', () => {
  let app: FastifyInstance;
  // requestOtpSchema enforces exactly +216 followed by 8 digits.
  const testPhone = `+216${String(Date.now() % 100_000_000).padStart(8, '0')}`;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    const db = getDatabase();
    await db.delete(otpCodes).where(eq(otpCodes.phone, testPhone));
    await closeDatabase();
  });

  it('returns 429 after exceeding the OTP-request endpoint limit (5/min)', async () => {
    const responses = [];
    for (let i = 0; i < 6; i += 1) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/otp/request',
          payload: { phone: testPhone },
        }),
      );
    }

    const statusCodes = responses.map((r) => r.statusCode);
    expect(statusCodes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statusCodes[5]).toBe(429);
  });
});
