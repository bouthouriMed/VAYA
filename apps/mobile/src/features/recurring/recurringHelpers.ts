import type { TFunction } from 'i18next';
import type { RecurringPattern } from '../../state/api';

/** Bitmask -> a short day-list, e.g. "Lun-Ven" for a contiguous
 *  weekday run, or "Lun, Mer, Ven" for a non-contiguous set. Mirrors
 *  `packages/domain/src/recurring/day-of-week.ts`'s Monday=bit0 convention. */
export function formatDaysOfWeek(mask: number, t: TFunction): string {
  const days: number[] = [];
  for (let bit = 0; bit < 7; bit += 1) {
    if (mask & (1 << bit)) days.push(bit);
  }
  if (days.length === 0) return '';
  if (days.length === 7) return t('booking:days.everyDay');

  const dayLabels = [
    t('booking:days.mon'),
    t('booking:days.tue'),
    t('booking:days.wed'),
    t('booking:days.thu'),
    t('booking:days.fri'),
    t('booking:days.sat'),
    t('booking:days.sun'),
  ];

  // A single contiguous run (e.g. Mon-Fri) reads better collapsed.
  const isContiguous = days.every((d, i) => i === 0 || d === days[i - 1]! + 1);
  if (isContiguous && days.length > 1) {
    return `${dayLabels[days[0]!]}-${dayLabels[days[days.length - 1]!]}`;
  }
  return days.map((d) => dayLabels[d]).join(', ');
}

/** "08:00" when start === end, "08:00-08:30" otherwise. */
export function formatTimeWindow(start: string, end: string): string {
  return start === end ? start : `${start}-${end}`;
}

/**
 * Detection-prompt copy. Deliberately does **not** quote a specific trip
 * count (unlike the phase doc's example "Vous avez pris cet itinéraire 3
 * fois ce mois-ci") — `recurring_patterns` (docs/domain/model.md) stores
 * only `confidenceScore`, not the underlying trip count, and CLAUDE.md's
 * "never show fabricated data" principle rules out inventing a number the
 * client was never actually given. "Plusieurs fois récemment" is the
 * honest equivalent — real, just not falsely precise.
 */
export function buildDetectionPromptCopy(pattern: Pick<RecurringPattern, 'role'>, t: TFunction): {
  title: string;
  body: string;
} {
  return {
    title: t('booking:recurring.detectedTitle'),
    body:
      pattern.role === 'driver'
        ? t('booking:recurring.detectedBodyDriver')
        : t('booking:recurring.detectedBodyRider'),
  };
}

/**
 * Pre-filled values for the driver auto-draft confirmation flow
 * (apps/mobile/app/recurring/confirm-draft.tsx) — "today, at the pattern's
 * usual time," reusing the ride-creation endpoint's own shape
 * (CreateRideInput) rather than a bespoke payload. `seatsTotal` defaults to
 * 3 (this codebase's own existing default in driver/publish.tsx) since a
 * recurring pattern carries no seat-count signal of its own.
 */
export function buildAutoDraftDepartureAt(pattern: Pick<RecurringPattern, 'timeWindowStart'>): Date {
  const [hoursStr, minutesStr] = pattern.timeWindowStart.split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  const departureAt = new Date();
  departureAt.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  // If the pattern's usual time has already passed today, default to "in
  // 30 minutes" instead of a same-day time already in the past — still a
  // same-day draft, never a stale one.
  if (departureAt.getTime() < Date.now()) {
    return new Date(Date.now() + 30 * 60_000);
  }
  return departureAt;
}

export const AUTO_DRAFT_DEFAULT_SEATS = 3;
