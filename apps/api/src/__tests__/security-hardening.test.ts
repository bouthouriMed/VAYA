import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Security regression suite (docs/security/security-audit.md). Boots the real
 * Fastify app and drives it with `inject`, with only the service functions
 * that would touch Postgres replaced — every assertion here is about the HTTP
 * layer's own security controls (rate limiting, token acceptance, endpoint
 * exposure), so it needs no database and runs anywhere.
 */

// Must be set before the first getEnv() call anywhere (values are cached).
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:1/test';
  process.env.JWT_SECRET = 'security-test-secret-at-least-32-characters-long';
  process.env.METRICS_TOKEN = 'metrics-token-for-tests-1234567890';
  // Explicit values (not deletes): env.ts calls dotenv.config(), which would
  // otherwise fill any unset variable from a developer's local apps/api/.env.
  process.env.TRUST_PROXY = 'false';
  process.env.EXPOSE_DEV_OTP = 'false';
  process.env.LOG_LEVEL = 'fatal';
});

const { requestOtpMock, verifyOtpMock, loginAdminMock, autocompleteMock } = vi.hoisted(() => ({
  requestOtpMock: vi.fn(async () => ({ code: '123456' })),
  verifyOtpMock: vi.fn(),
  loginAdminMock: vi.fn(),
  autocompleteMock: vi.fn(async () => []),
}));

vi.mock('../modules/auth/auth.service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestOtp: requestOtpMock,
  verifyOtpAndIssueTokens: verifyOtpMock,
}));
vi.mock('../modules/admin/admin-auth.service.js', () => ({ loginAdmin: loginAdminMock }));
vi.mock('../modules/geocoding/geocoding.service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  autocompleteLocation: autocompleteMock,
}));

import { buildApp } from '../app.js';
import { UnauthorizedError } from '../lib/errors.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

let phoneCounter = 0;
/** A fresh, schema-valid Tunisian phone number per call. */
function freshPhone(): string {
  phoneCounter += 1;
  return `+216${String(20_000_000 + phoneCounter).padStart(8, '0')}`;
}

function requestOtp(phone: string, remoteAddress: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/request',
    remoteAddress,
    headers,
    payload: { phone },
  });
}

describe('VAYA-SEC-001/007: OTP request limits are real (per phone AND per IP)', () => {
  beforeAll(() => {
    verifyOtpMock.mockRejectedValue(new UnauthorizedError('Invalid or expired code'));
  });

  it('limits requests for ONE phone number even when every request comes from a different IP', async () => {
    // The old "per-phone" keyGenerator read request.body in onRequest, where
    // the body is not parsed yet — so it silently keyed on the client IP and
    // an attacker rotating source addresses had an unlimited budget.
    const phone = freshPhone();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await requestOtp(phone, `10.20.0.${i + 1}`)).statusCode);
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]); // 3 / 10 min per phone
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  it('limits how many DIFFERENT phone numbers one IP can trigger SMS for (SMS pumping)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      statuses.push((await requestOtp(freshPhone(), '10.30.0.1')).statusCode);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(10); // 10 / min per IP
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('does not let a client choose its own rate-limit identity via X-Forwarded-For', async () => {
    // TRUST_PROXY unset outside production => XFF is ignored; the socket
    // address is the identity, so rotating the header buys nothing.
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      statuses.push(
        (await requestOtp(freshPhone(), '10.40.0.1', { 'x-forwarded-for': `203.0.113.${i + 1}` })).statusCode,
      );
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(2);
  });

  it('never returns the OTP in the response unless dev exposure is explicitly opted in', async () => {
    const res = await requestOtp(freshPhone(), '10.50.0.1');
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('devCode');
  });

  it('cuts off rapid OTP guessing for one phone with 429, whatever the source address', async () => {
    const phone = freshPhone();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp/verify',
        remoteAddress: `10.60.0.${(i % 200) + 1}`,
        payload: { phone, code: String(100000 + i) },
      });
      statuses.push(res.statusCode);
    }
    // 10 verify attempts / 10 min per phone regardless of source address: the
    // first 10 reach the (mocked) service and are rejected 401, the rest are
    // cut off with 429 before any code comparison happens.
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
  });
});

describe('VAYA-SEC-005: admin login limit cannot be dodged by changing email case', () => {
  it('counts A@x, a@x and A@X against the same budget', async () => {
    loginAdminMock.mockRejectedValue(new UnauthorizedError('Invalid email or password'));
    const variants = ['Boss@Vaya.test', 'boss@vaya.test', 'BOSS@VAYA.TEST', 'bOsS@vaya.test', 'Boss@vaya.test', 'boss@VAYA.test'];
    const statuses: number[] = [];
    for (const [i, email] of variants.entries()) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/login',
        remoteAddress: `10.70.0.${i + 1}`, // even rotating IPs
        payload: { email, password: 'wrong-password' },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]); // 5 / 10 min per email
    expect(statuses[5]).toBe(429);
  });

  it('rejects an absurdly long password before any hashing work happens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/login',
      remoteAddress: '10.71.0.1',
      payload: { email: 'someone@vaya.test', password: 'x'.repeat(5000) },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('VAYA-SEC-008: /metrics is not public', () => {
  it('rejects a request with no token', async () => {
    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
  });
  it('rejects a wrong token', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer nope' } });
    expect(res.statusCode).toBe(401);
  });
  it('serves metrics with the correct token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${process.env.METRICS_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('Token-type confusion: non-session JWTs are not bearer credentials', () => {
  it('rejects the Google OAuth `state` JWT (same signing secret) with 401, not a 500', async () => {
    // Anyone can obtain one by calling /auth/google/start.
    const stateToken = app.jwt.sign({ sub: 'google_oauth_state:vaya://auth/google' }, { expiresIn: '5m' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${stateToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an admin token on consumer endpoints', async () => {
    const adminToken = app.jwt.sign(
      { sub: '00000000-0000-4000-8000-000000000001', type: 'admin', role: 'superadmin' },
      { expiresIn: '5m' },
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a consumer token on admin endpoints', async () => {
    const userToken = app.jwt.sign({ sub: '00000000-0000-4000-8000-000000000002' }, { expiresIn: '5m' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('requires a token at all', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/users/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/users' })).statusCode).toBe(401);
  });
});

describe('VAYA-SEC-011: anonymous endpoints that proxy paid APIs are rate limited', () => {
  it('cuts off /geocoding/autocomplete after 60 requests/minute per client', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 63; i += 1) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/geocoding/autocomplete?input=tunis&sessionToken=8f1b5d0e-9d3c-4c1a-8a52-3a3f0c2f7b11',
        remoteAddress: '10.80.0.1',
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(60).every((s) => s === 429)).toBe(true);
  });
});

describe('Endpoint exposure', () => {
  it('serves the API docs outside production (dev/test convenience)', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).statusCode).toBe(200);
  });
});
