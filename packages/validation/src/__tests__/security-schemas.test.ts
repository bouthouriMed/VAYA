import { describe, it, expect } from 'vitest';
import { adminLoginSchema, analyticsEventsIngestSchema, registerPushTokenSchema } from '../index';

// Input-bound regressions from the 2026-09-21 security sprint
// (docs/security/security-audit.md).

describe('adminLoginSchema (VAYA-SEC-005)', () => {
  it('accepts a normal credential', () => {
    expect(adminLoginSchema.safeParse({ email: 'ops@vaya.tn', password: 'correct horse battery' }).success).toBe(
      true,
    );
  });
  it('rejects a password long enough to be a CPU-exhaustion lever against scrypt', () => {
    expect(adminLoginSchema.safeParse({ email: 'ops@vaya.tn', password: 'x'.repeat(257) }).success).toBe(false);
  });
  it('rejects an absurdly long email', () => {
    expect(adminLoginSchema.safeParse({ email: `${'a'.repeat(250)}@vaya.tn`, password: 'x' }).success).toBe(false);
  });
});

describe('registerPushTokenSchema', () => {
  it('accepts real Expo push tokens', () => {
    expect(registerPushTokenSchema.safeParse({ token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', platform: 'ios' }).success).toBe(true);
    expect(registerPushTokenSchema.safeParse({ token: 'ExpoPushToken[abc-DEF_123]', platform: 'android' }).success).toBe(true);
  });
  it('rejects arbitrary strings (the value is later used as the recipient of an Expo push)', () => {
    for (const token of ['not-a-token-at-all', 'ExponentPushToken[]', 'ExponentPushToken[a b]', 'https://evil.example/x', 'ExponentPushToken[a]]']) {
      expect(registerPushTokenSchema.safeParse({ token, platform: 'ios' }).success, token).toBe(false);
    }
  });
});

describe('analyticsEventsIngestSchema', () => {
  const base = { eventName: 'search_submitted' };
  it('accepts a normal event', () => {
    expect(
      analyticsEventsIngestSchema.safeParse({
        events: [{ ...base, originLat: 36.8, originLng: 10.18, metadata: { source: 'explore' } }],
      }).success,
    ).toBe(true);
  });
  it('rejects out-of-range coordinates', () => {
    expect(analyticsEventsIngestSchema.safeParse({ events: [{ ...base, originLat: 999 }] }).success).toBe(false);
    expect(analyticsEventsIngestSchema.safeParse({ events: [{ ...base, destinationLng: -400 }] }).success).toBe(false);
  });
  it('rejects oversized free-form metadata (storage exhaustion)', () => {
    const big = { blob: 'x'.repeat(5000) };
    expect(analyticsEventsIngestSchema.safeParse({ events: [{ ...base, metadata: big }] }).success).toBe(false);
  });
});
