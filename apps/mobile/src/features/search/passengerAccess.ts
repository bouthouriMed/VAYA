import { describePassengerAccess, estimateWalk } from '@vaya/domain';
import { formatDistance } from '../../utils/localeFormat';
import type { SupportedLocale } from '@vaya/config';

type TFn = (key: string, params?: Record<string, unknown>) => string;

/**
 * The one way the app describes how far a passenger goes to reach (or
 * leave) the car, from the server's honest street-walk estimate
 * (`walkMeters`): a walking time up to 20 minutes, otherwise a distance —
 * an intercity meeting point a few km out is never shown as a 50-minute
 * walk. Rules live in @vaya/domain's describePassengerAccess.
 */

/** "6 min" or "4.4 km" — for sentences that already say where to/from
 *  ("{{minutes}} to the meeting point"). */
export function accessAmount(t: TFn, walkMeters: number, locale: SupportedLocale): string {
  const access = describePassengerAccess(walkMeters);
  return access.kind === 'walk'
    ? t('common:terms.minute', { count: access.minutes })
    : formatDistance(access.kilometers * 1000, locale);
}

/** "6 min walk" or "4.4 km away" — standalone. */
export function accessLabel(t: TFn, walkMeters: number, locale: SupportedLocale): string {
  const access = describePassengerAccess(walkMeters);
  return access.kind === 'walk'
    ? t('search:walk.suffix', { minutes: t('common:terms.minute', { count: access.minutes }) })
    : t('search:walk.distanceAway', { distance: formatDistance(access.kilometers * 1000, locale) });
}

/** Honest street-walk estimate for a straight-line distance the device
 *  measured itself (e.g. its live position to the pickup point). */
export function walkMetersForStraightLine(straightLineM: number): number {
  return estimateWalk(straightLineM).walkMeters;
}
