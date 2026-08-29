import { describe, it, expect } from 'vitest';
import {
  computeBookingExpiresAt,
  hasBookingRequestExpired,
  BOOKING_REQUEST_RESPONSE_WINDOW_MINUTES,
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
