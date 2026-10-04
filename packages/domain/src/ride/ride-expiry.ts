import type { TripStatus } from '../trip/trip-status';
import { DEFAULT_ASSUMED_TRIP_DURATION_SEC, TRIP_AUTO_CLOSE_GRACE_MS } from '../trip/trip-staleness';

// Spec §44 ("a trip must not remain permanently IN_PROGRESS because someone
// forgot to tap a button") was implemented per *trip* — the trip-staleness
// sweep and GPS lifecycle inference all act on a booking's trip row. A ride
// whose status never left `published`/`full` fell through that net
// entirely: with zero accepted bookings there is no trip to infer anything
// from (and the driver's phone never broadcasts GPS without one), and a
// trip completed straight from `scheduled` never moved its ride to
// `in_progress` first, so the ride-level `in_progress -> completed` sync
// couldn't fire either. Either way the ride sat in `published` forever.
// This is the ride-level half of the same safety net.

/** Trip statuses that still have their own lifecycle running — the trip
 *  sweep / GPS inference owns these, so the ride is left alone until they
 *  settle rather than closed out from under them. */
const LIVE_TRIP_STATUSES: readonly TripStatus[] = [
  'scheduled',
  'driver_approaching',
  'pickup',
  'active',
  'arriving',
];

export type UnstartedRideAction = 'none' | 'expire' | 'complete';

export interface UnstartedRideCheckInput {
  departureAt: Date;
  /** The ride's routed duration; null for a haversine-fallback route. */
  estimatedDurationSec: number | null;
  /** Status of every trip on the ride (one per accepted booking) — empty
   *  when no booking was ever accepted. */
  tripStatuses: readonly TripStatus[];
  now: Date;
}

/** When a never-started ride is considered over: its expected arrival plus
 *  the same generous grace the trip sweep uses before auto-closing an
 *  abandoned trip, so a ride is never closed while it could plausibly
 *  still be happening. */
export function unstartedRideCloseAt(departureAt: Date, estimatedDurationSec: number | null): Date {
  const durationMs = (estimatedDurationSec ?? DEFAULT_ASSUMED_TRIP_DURATION_SEC) * 1000;
  return new Date(departureAt.getTime() + durationMs + TRIP_AUTO_CLOSE_GRACE_MS);
}

/**
 * Pure decision for a `published`/`full` ride (one whose status never
 * reached `in_progress`). The caller applies the result:
 *  - `expire`: nothing was ever driven — no trip, or every trip ended as a
 *    no-show/cancellation.
 *  - `complete`: at least one passenger's trip was completed (straight from
 *    `scheduled`, without the driver ever tapping "Démarrer").
 *  - `none`: too early, or a trip is still live and owns its own closing.
 */
export function computeUnstartedRideAction(input: UnstartedRideCheckInput): UnstartedRideAction {
  if (input.now.getTime() < unstartedRideCloseAt(input.departureAt, input.estimatedDurationSec).getTime()) {
    return 'none';
  }
  if (input.tripStatuses.some((status) => LIVE_TRIP_STATUSES.includes(status))) return 'none';
  if (input.tripStatuses.includes('completed')) return 'complete';
  return 'expire';
}
