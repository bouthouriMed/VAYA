import { dayOfWeekMaskIncludes } from './day-of-week';

/**
 * The next Date (today included, if the time hasn't already passed) that
 * satisfies an `enabled` pattern's `daysOfWeekMask`/`timeWindowStart` — used
 * by the proactive rider-match check
 * (apps/api/src/modules/recurring/recurring.service.ts) to build a concrete
 * search instant for `matching.service.ts`'s existing `searchRides`, and by
 * the driver auto-draft flow to know whether *today* is even a match day
 * for a pattern before offering the one-tap confirmation.
 *
 * Pure — takes `now` as a parameter (defaulting to `new Date()`) so it's
 * directly testable without faking the system clock. Scans at most 8 days
 * forward (today + a full week) since `daysOfWeekMask` always has at least
 * one bit set for any pattern that ever reached `detected` (a cluster with
 * zero trips can't exist) — returns `null` only for a malformed
 * zero-bit mask.
 */
export function nextOccurrenceForPattern(
  pattern: { daysOfWeekMask: number; timeWindowStart: string },
  now: Date = new Date(),
): Date | null {
  if (pattern.daysOfWeekMask === 0) return null;

  const parts = pattern.timeWindowStart.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + dayOffset);
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate.getTime() < now.getTime()) continue;
    if (dayOfWeekMaskIncludes(pattern.daysOfWeekMask, candidate)) return candidate;
  }
  return null;
}
