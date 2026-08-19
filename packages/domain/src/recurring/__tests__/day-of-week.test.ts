import { describe, it, expect } from 'vitest';
import { dayOfWeekBitForDate, dayOfWeekMaskIncludes } from '../day-of-week';

describe('dayOfWeekBitForDate', () => {
  it('maps Monday to bit 0 and Sunday to bit 6', () => {
    expect(dayOfWeekBitForDate(new Date('2026-08-17T08:00:00'))).toBe(0); // Monday
    expect(dayOfWeekBitForDate(new Date('2026-08-18T08:00:00'))).toBe(1); // Tuesday
    expect(dayOfWeekBitForDate(new Date('2026-08-23T08:00:00'))).toBe(6); // Sunday
  });
});

describe('dayOfWeekMaskIncludes', () => {
  it('correctly checks membership against a weekday mask', () => {
    const weekdaysMask = 0b0011111; // Mon-Fri
    expect(dayOfWeekMaskIncludes(weekdaysMask, new Date('2026-08-17T08:00:00'))).toBe(true); // Mon
    expect(dayOfWeekMaskIncludes(weekdaysMask, new Date('2026-08-21T08:00:00'))).toBe(true); // Fri
    expect(dayOfWeekMaskIncludes(weekdaysMask, new Date('2026-08-22T08:00:00'))).toBe(false); // Sat
    expect(dayOfWeekMaskIncludes(weekdaysMask, new Date('2026-08-23T08:00:00'))).toBe(false); // Sun
  });
});
