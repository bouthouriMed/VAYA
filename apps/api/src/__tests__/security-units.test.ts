import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:1/test';
  process.env.JWT_SECRET = 'security-test-secret-at-least-32-characters-long';
});

import {
  OTP_MAX_ATTEMPTS_PER_WINDOW,
  hashOtpCode,
  isOtpLockedOut,
  otpHashesMatch,
} from '../modules/auth/otp-policy.js';
import { decideGoogleAccountLink } from '../modules/auth/auth.service.js';
import { canCompleteTripNow } from '../modules/trips/trip-completion-guard.js';
import {
  extractObjectName,
  resolvePublicFileReference,
  resolveSecureFileReference,
} from '../lib/storage/file-refs.js';
import { redactUrlSecrets } from '../config/logger.js';
import {
  assertProductionSafe,
  resolveTrustProxy,
  shouldExposeDevOtp,
  shouldServeApiDocs,
  type Env,
} from '../config/env.js';

const UUID = '3f2b8c1a-9d4e-4b7a-8c11-0a1b2c3d4e5f';

describe('VAYA-SEC-002: OTP policy', () => {
  it('stores an HMAC, not the code, and binds it to the phone', () => {
    const secret = 's'.repeat(32);
    const hash = hashOtpCode(secret, '+21620000001', '123456');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('123456');
    expect(hash).toBe(hashOtpCode(secret, '+21620000001', '123456')); // deterministic
    expect(hash).not.toBe(hashOtpCode(secret, '+21620000002', '123456')); // phone-bound
    expect(hash).not.toBe(hashOtpCode('t'.repeat(32), '+21620000001', '123456')); // secret-bound
  });

  it('compares digests in constant time and rejects mismatches / malformed input', () => {
    const secret = 's'.repeat(32);
    const a = hashOtpCode(secret, '+21620000001', '111111');
    expect(otpHashesMatch(a, a)).toBe(true);
    expect(otpHashesMatch(a, hashOtpCode(secret, '+21620000001', '111112'))).toBe(false);
    expect(otpHashesMatch(a, 'zz')).toBe(false);
    expect(otpHashesMatch(a, '')).toBe(false);
  });

  it('locks a phone out once its per-window guess budget is spent', () => {
    expect(isOtpLockedOut(0)).toBe(false);
    expect(isOtpLockedOut(OTP_MAX_ATTEMPTS_PER_WINDOW - 1)).toBe(false);
    expect(isOtpLockedOut(OTP_MAX_ATTEMPTS_PER_WINDOW)).toBe(true);
    expect(isOtpLockedOut(OTP_MAX_ATTEMPTS_PER_WINDOW + 50)).toBe(true);
  });
});

describe('VAYA-SEC-003: Google account linking decision', () => {
  it('never links or stores an UNVERIFIED email', () => {
    expect(
      decideGoogleAccountLink({ email: 'victim@x.com', emailVerified: false }, { id: 'u1', googleId: null }),
    ).toEqual({ action: 'create', storeEmail: false });
    expect(decideGoogleAccountLink({ email: 'victim@x.com' }, { id: 'u1', googleId: null })).toEqual({
      action: 'create',
      storeEmail: false,
    });
  });

  it('links a verified email to an existing account that has no Google identity yet', () => {
    expect(
      decideGoogleAccountLink({ email: 'a@x.com', emailVerified: true }, { id: 'u1', googleId: null }),
    ).toEqual({ action: 'link', existingUserId: 'u1' });
  });

  it('refuses to re-bind an account that already has a (different) Google identity', () => {
    expect(
      decideGoogleAccountLink({ email: 'a@x.com', emailVerified: true }, { id: 'u1', googleId: 'g-owner' }),
    ).toEqual({ action: 'reject', reason: 'EMAIL_BOUND_TO_OTHER_GOOGLE_ACCOUNT' });
  });

  it('creates a fresh account (storing the verified email) when nothing matches', () => {
    expect(decideGoogleAccountLink({ email: 'new@x.com', emailVerified: true }, undefined)).toEqual({
      action: 'create',
      storeEmail: true,
    });
  });
});

describe('VAYA-SEC-004: a trip cannot be completed before it has started', () => {
  const departure = new Date('2026-09-21T10:00:00Z');
  const before = new Date('2026-09-21T09:00:00Z');
  const after = new Date('2026-09-21T10:30:00Z');

  it('refuses scheduled / approaching / pickup trips before the ride departs', () => {
    for (const status of ['scheduled', 'driver_approaching', 'pickup'] as const) {
      expect(canCompleteTripNow({ status, rideDepartureAt: departure, now: before })).toBe(false);
    }
  });

  it('allows the manual flow once the ride is due', () => {
    for (const status of ['scheduled', 'driver_approaching', 'pickup'] as const) {
      expect(canCompleteTripNow({ status, rideDepartureAt: departure, now: after })).toBe(true);
    }
  });

  it('allows an in-progress trip at any time', () => {
    for (const status of ['active', 'arriving'] as const) {
      expect(canCompleteTripNow({ status, rideDepartureAt: departure, now: before })).toBe(true);
    }
  });

  it('never completes a terminal trip', () => {
    for (const status of ['completed', 'no_show', 'cancelled'] as const) {
      expect(canCompleteTripNow({ status, rideDepartureAt: departure, now: after })).toBe(false);
    }
  });
});

describe('VAYA-SEC-009: file references are validated and rebuilt, never stored verbatim', () => {
  const toPublicUrl = (name: string) => `/uploads/${name}`;

  it('accepts the shapes this API mints (relative, absolute-resolved, S3 public/)', () => {
    expect(extractObjectName(`/uploads/${UUID}.jpg`, 'public')).toBe(`${UUID}.jpg`);
    expect(extractObjectName(`http://192.168.1.5:3000/uploads/${UUID}.PNG`, 'public')).toBe(`${UUID}.png`);
    expect(extractObjectName(`https://bucket.s3.amazonaws.com/public/${UUID}.webp`, 'public')).toBe(`${UUID}.webp`);
    expect(extractObjectName(`/secure-uploads/${UUID}.pdf`, 'secure')).toBe(`${UUID}.pdf`);
  });

  it('rebuilds the stored value from the object name (a foreign host never survives)', () => {
    expect(resolvePublicFileReference(`https://evil.example/uploads/${UUID}.jpg`, toPublicUrl)).toBe(
      `/uploads/${UUID}.jpg`,
    );
    expect(resolveSecureFileReference(`https://evil.example/secure-uploads/${UUID}.jpg`)).toBe(
      `/secure-uploads/${UUID}.jpg`,
    );
  });

  it('rejects arbitrary URLs, traversal, non-http schemes and wrong-area references', () => {
    const bad = [
      'https://example.com/license.jpg',
      'https://tracker.example/pixel.gif?u=1',
      `javascript:alert(1)//uploads/${UUID}.jpg`,
      `file:///etc/passwd`,
      `/uploads/../../etc/passwd`,
      `/uploads/${UUID}.svg`,
      `/uploads/${UUID}.html`,
      `/uploads/not-a-uuid.jpg`,
      `/uploads/`,
      '',
      `/secure-uploads/${UUID}.jpg`, // a secure ref is not a valid PUBLIC ref
    ];
    for (const ref of bad) {
      expect(extractObjectName(ref, 'public'), ref).toBeNull();
    }
    expect(() => resolvePublicFileReference('https://example.com/a.jpg', toPublicUrl)).toThrow(/Invalid file reference/);
    expect(() => resolveSecureFileReference(`/uploads/${UUID}.jpg`)).toThrow(/Invalid file reference/);
    expect(() => resolveSecureFileReference('x'.repeat(600))).toThrow();
  });
});

describe('Log hygiene: secrets in query strings are redacted', () => {
  it('masks the WebSocket JWT and OAuth one-time values', () => {
    expect(redactUrlSecrets('/ws/trips/abc?token=eyJhbGciOi.payload.sig')).toBe('/ws/trips/abc?token=[REDACTED]');
    expect(redactUrlSecrets('/auth/google/callback?code=4%2F0Ab&state=eyJ.x.y&scope=email')).toBe(
      '/auth/google/callback?code=[REDACTED]&state=[REDACTED]&scope=email',
    );
    expect(redactUrlSecrets('/x?ticket=abc&Token=def&a=1')).toBe('/x?ticket=[REDACTED]&Token=[REDACTED]&a=1');
  });
  it('leaves harmless URLs untouched', () => {
    expect(redactUrlSecrets('/api/v1/rides?limit=5')).toBe('/api/v1/rides?limit=5');
    expect(redactUrlSecrets('/health')).toBe('/health');
    expect(redactUrlSecrets(undefined)).toBeUndefined();
  });
});

function envWith(overrides: Partial<Env>): Env {
  return {
    NODE_ENV: 'development',
    EXPOSE_DEV_OTP: false,
    ENABLE_API_DOCS: undefined,
    TRUST_PROXY: undefined,
    ...overrides,
  } as Env;
}

describe('VAYA-SEC-001: devCode exposure fails closed', () => {
  it('needs development + explicit opt-in + no real SMS provider', () => {
    expect(shouldExposeDevOtp(envWith({ EXPOSE_DEV_OTP: true }))).toBe(true);
    // The documented deploy path copies NODE_ENV=development into prod env
    // files — without the explicit flag that must NOT leak codes.
    expect(shouldExposeDevOtp(envWith({ EXPOSE_DEV_OTP: false }))).toBe(false);
    expect(shouldExposeDevOtp(envWith({ NODE_ENV: 'production', EXPOSE_DEV_OTP: true }))).toBe(false);
    expect(shouldExposeDevOtp(envWith({ NODE_ENV: 'test', EXPOSE_DEV_OTP: true }))).toBe(false);
    expect(
      shouldExposeDevOtp(
        envWith({
          EXPOSE_DEV_OTP: true,
          TWILIO_ACCOUNT_SID: 'AC1',
          TWILIO_AUTH_TOKEN: 't',
          TWILIO_FROM_NUMBER: '+1',
        }),
      ),
    ).toBe(false);
  });

  it('refuses to boot in production with dev OTP exposure or a blanket proxy trust', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = {
      NODE_ENV: 'production',
      JWT_SECRET: 'j'.repeat(40),
      CORS_ORIGIN: 'https://admin.vaya.test',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 't',
      TWILIO_FROM_NUMBER: '+1',
      S3_BUCKET: 'b',
      S3_REGION: 'r',
      S3_ACCESS_KEY_ID: 'k',
      S3_SECRET_ACCESS_KEY: 's',
    } as Partial<Env>;
    expect(() => assertProductionSafe(envWith({ ...base, EXPOSE_DEV_OTP: true }))).toThrow('process.exit');
    expect(() => assertProductionSafe(envWith({ ...base, TRUST_PROXY: 'true' }))).toThrow('process.exit');
    expect(() => assertProductionSafe(envWith({ ...base }))).not.toThrow();
    exit.mockRestore();
    err.mockRestore();
  });
});

describe('Proxy trust and docs exposure', () => {
  it('trusts no proxy by default outside production, one hop in production', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'development', TRUST_PROXY: undefined })).toBe(false);
    expect(resolveTrustProxy({ NODE_ENV: 'test', TRUST_PROXY: undefined })).toBe(false);
    const prod = resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: undefined });
    expect(typeof prod).toBe('function');
    const trust = prod as (address: string, hop: number) => boolean;
    expect(trust('10.0.0.2', 0)).toBe(true); // the reverse proxy itself
    expect(trust('203.0.113.9', 1)).toBe(false); // whatever a client claims beyond it
  });

  it('honours an explicit setting and treats garbage as "trust nothing"', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: 'false' })).toBe(false);
    expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: '0' })).toBe(false);
    expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: 'banana' })).toBe(false);
    const two = resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: '2' }) as (a: string, h: number) => boolean;
    expect(two('x', 1)).toBe(true);
    expect(two('x', 2)).toBe(false);
  });

  it('serves API docs outside production only, unless explicitly enabled', () => {
    expect(shouldServeApiDocs({ NODE_ENV: 'development', ENABLE_API_DOCS: undefined })).toBe(true);
    expect(shouldServeApiDocs({ NODE_ENV: 'production', ENABLE_API_DOCS: undefined })).toBe(false);
    expect(shouldServeApiDocs({ NODE_ENV: 'production', ENABLE_API_DOCS: true })).toBe(true);
    expect(shouldServeApiDocs({ NODE_ENV: 'development', ENABLE_API_DOCS: false })).toBe(false);
  });
});
