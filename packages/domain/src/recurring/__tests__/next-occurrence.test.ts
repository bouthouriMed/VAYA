import { describe, it, expect } from 'vitest';
import { nextOccurrenceForPattern } from '../next-occurrence';

describe('nextOccurrenceForPattern', () => {
  it('returns later today when today matches and the time has not passed yet', () => {
    const now = new Date('2026-08-17T07:00:00'); // Monday, 07:00
    const pattern = { daysOfWeekMask: 0b0011111, timeWindowStart: '08:00' }; // Mon-Fri, 08:00
    const result = nextOccurrenceForPattern(pattern, now);
    expect(result).not.toBeNull();
    expect(result!.toDateString()).toBe(now.toDateString());
    expect(result!.getHours()).toBe(8);
    expect(result!.getMinutes()).toBe(0);
  });

  it('skips to the next matching day when today matches but the time already passed', () => {
    const now = new Date('2026-08-17T09:00:00'); // Monday, 09:00 (past 08:00)
    const pattern = { daysOfWeekMask: 0b0011111, timeWindowStart: '08:00' };
    const result = nextOccurrenceForPattern(pattern, now);
    expect(result).not.toBeNull();
    // Next Mon-Fri occurrence after Monday 09:00 is Tuesday 08:00.
    expect(result!.toDateString()).toBe(new Date('2026-08-18T08:00:00').toDateString());
  });

  it('skips non-matching days entirely (e.g. a weekend-only pattern from a weekday)', () => {
    const now = new Date('2026-08-17T07:00:00'); // Monday
    const pattern = { daysOfWeekMask: 0b1000000, timeWindowStart: '09:00' }; // Sunday only
    const result = nextOccurrenceForPattern(pattern, now);
    expect(result).not.toBeNull();
    expect(result!.getDay()).toBe(0); // Sunday
  });

  it('returns null for a malformed zero-bit mask', () => {
    expect(nextOccurrenceForPattern({ daysOfWeekMask: 0, timeWindowStart: '08:00' })).toBeNull();
  });
});
