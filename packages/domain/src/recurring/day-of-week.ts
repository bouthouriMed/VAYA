/**
 * Bitmask day-of-week helpers shared by detection (marking which days a
 * cluster's trips fell on) and proactive rider-matching (computing "does
 * today match this enabled pattern"). Convention (matches
 * docs/domain/model.md and `recurring_patterns.daysOfWeekMask`): bit 0 =
 * Monday ... bit 6 = Sunday. `Date.prototype.getDay()` uses the opposite
 * convention (0 = Sunday ... 6 = Saturday), so this module is the one place
 * that conversion happens — every other module works only in the
 * Monday-first bit convention.
 */
export function dayOfWeekBitForDate(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function dayOfWeekMaskIncludes(mask: number, date: Date): boolean {
  return (mask & (1 << dayOfWeekBitForDate(date))) !== 0;
}
