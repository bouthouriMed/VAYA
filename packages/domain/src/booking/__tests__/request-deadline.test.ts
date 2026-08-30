import { describe, it, expect } from 'vitest';
import {
  computeBookingExpiresAt,
  hasBookingRequestExpired,
  isDeadlineApproaching,
  BOOKING_REQUEST_RESPONSE_WINDOW_MINUTES,
  DEADLINE_APPROACHING_LEAD_MINUTES,
} from '../request-deadline';

describe('request-deadline — server-authoritative response window (M-054)', () => {
  it('computes expiresAt as requestedAt + the configured window', () => {
    const requestedAt = new Date('2026-09-01T10:00:00.000Z');
    const expiresAt = computeBookingExpiresAt(requestedAt);
    expect(expiresAt.getTime() - requestedAt.getTime()).toBe(
      BOOKING_REQUEST_RESPONSE_WINDOW_MINUTES * 60_000,
    );
  });

  it('respects an injected window override rather than hardcoding the default', () => {
    const requestedAt = new Date('2026-09-01T10:00:00.000Z');
    const expiresAt = computeBookingExpiresAt(requestedAt, 15);
    expect(expiresAt.getTime() - requestedAt.getTime()).toBe(15 * 60_000);
  });

  it('reports not-yet-expired before the deadline and expired at/after it (boundary inclusive)', () => {
    const requestedAt = new Date('2026-09-01T10:00:00.000Z');
    const expiresAt = computeBookingExpiresAt(requestedAt, 7);

    expect(hasBookingRequestExpired(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(hasBookingRequestExpired(expiresAt, expiresAt)).toBe(true);
    expect(hasBookingRequestExpired(expiresAt, new Date(expiresAt.getTime() + 1))).toBe(true);
  });
});

describe('isDeadlineApproaching — M-113 "request deadline approaching" reminder gate', () => {
  const expiresAt = new Date('2026-09-01T10:07:00.000Z');

  it('not yet approaching well before the deadline', () => {
    const now = new Date(expiresAt.getTime() - (DEADLINE_APPROACHING_LEAD_MINUTES + 1) * 60_000);
    expect(isDeadlineApproaching(expiresAt, now)).toBe(false);
  });

  it('approaching once inside the configured lead window', () => {
    const now = new Date(expiresAt.getTime() - (DEADLINE_APPROACHING_LEAD_MINUTES - 1) * 60_000);
    expect(isDeadlineApproaching(expiresAt, now)).toBe(true);
  });

  it('no longer "approaching" once the deadline has actually passed — that is expiry, a separate state', () => {
    expect(isDeadlineApproaching(expiresAt, expiresAt)).toBe(false);
    expect(isDeadlineApproaching(expiresAt, new Date(expiresAt.getTime() + 1000))).toBe(false);
  });

  it('respects an injected lead-time override rather than hardcoding the default', () => {
    const now = new Date(expiresAt.getTime() - 4 * 60_000);
    expect(isDeadlineApproaching(expiresAt, now, 2)).toBe(false);
    expect(isDeadlineApproaching(expiresAt, now, 5)).toBe(true);
  });
});
