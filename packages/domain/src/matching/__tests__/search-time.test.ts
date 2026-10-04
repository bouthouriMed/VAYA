import { describe, it, expect } from 'vitest';
import {
  isNearRequestedTime,
  localDayBounds,
  searchTimeWindow,
  DEPARTED_GRACE_MIN,
  NEAR_REQUESTED_TIME_MIN,
} from '../search-time';

const TUNIS = 'Africa/Tunis'; // UTC+1, no DST.

describe('localDayBounds', () => {
  it('returns the Tunis calendar day, not the UTC one', () => {
    // 23:30 UTC on 1 Sept is already 00:30 on 2 Sept in Tunis.
    const { start, end } = localDayBounds(new Date('2026-09-01T23:30:00Z'), TUNIS);
    expect(start.toISOString()).toBe('2026-09-01T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-02T23:00:00.000Z');
  });

  it('handles a zone with DST (Paris, spring forward)', () => {
    const { start, end } = localDayBounds(new Date('2026-03-29T12:00:00Z'), 'Europe/Paris');
    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-29T22:00:00.000Z'); // a 23-hour day
  });
});

describe('searchTimeWindow', () => {
  it('a 15:00 search covers the whole day, from morning to midnight', () => {
    const requestedAt = new Date('2026-09-10T14:00:00Z'); // 15:00 Tunis
    const now = new Date('2026-09-09T08:00:00Z'); // the day before
    const { start, end } = searchTimeWindow({ requestedAt, now, timeZone: TUNIS });
    expect(start.toISOString()).toBe('2026-09-09T23:00:00.000Z'); // 00:00 Tunis
    expect(end.getTime()).toBe(new Date('2026-09-10T23:00:00Z').getTime() - 1);
  });

  it('never includes rides that already left today', () => {
    const requestedAt = new Date('2026-09-10T14:00:00Z');
    const now = new Date('2026-09-10T10:00:00Z');
    const { start } = searchTimeWindow({ requestedAt, now, timeZone: TUNIS });
    expect(start.getTime()).toBe(now.getTime() - DEPARTED_GRACE_MIN * 60_000);
  });

  it('a late-evening search still reaches rides just after midnight', () => {
    const requestedAt = new Date('2026-09-10T22:30:00Z'); // 23:30 Tunis
    const now = new Date('2026-09-09T08:00:00Z');
    const { end } = searchTimeWindow({ requestedAt, now, timeZone: TUNIS });
    expect(end.getTime()).toBeGreaterThanOrEqual(new Date('2026-09-11T02:30:00Z').getTime());
  });
});

describe('isNearRequestedTime', () => {
  const requested = new Date('2026-09-10T14:00:00Z');
  it(`counts a pickup within ${NEAR_REQUESTED_TIME_MIN} min either side`, () => {
    expect(isNearRequestedTime(new Date('2026-09-10T15:30:00Z'), requested)).toBe(true);
    expect(isNearRequestedTime(new Date('2026-09-10T12:30:00Z'), requested)).toBe(true);
  });
  it('does not count a ride later or earlier in the day', () => {
    expect(isNearRequestedTime(new Date('2026-09-10T15:31:00Z'), requested)).toBe(false);
    expect(isNearRequestedTime(new Date('2026-09-10T07:00:00Z'), requested)).toBe(false);
  });
});
