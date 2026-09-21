import type { TripStatus } from '@vaya/domain';

/**
 * When may a trip party declare a trip "completed"?
 * (docs/security/security-audit.md VAYA-SEC-004.)
 *
 * `POST /trips/:id/complete` is callable by either party and the domain state
 * machine allows `completed` from every non-terminal status (Phase 9 added
 * that because the trip-progress flow was still mocked). Combined, that let a
 * rider — or a driver — complete a trip the instant a booking was accepted,
 * hours before departure and with no journey at all. Completion is what
 * unlocks ratings, increments `tripCount` on both profiles, and feeds the
 * trust tier ("Top VAYA"), so two cooperating accounts could mint reputation
 * with zero real trips, and a hostile rider could end a driver's trip early
 * to open the rating window on their own terms.
 *
 * Rule: completion is only valid once the journey has genuinely begun.
 *  - `active` / `arriving`: the driver confirmed boarding (or GPS inferred it)
 *    — completing is legitimate at any time from here;
 *  - `scheduled` / `driver_approaching` / `pickup`: the journey hasn't been
 *    confirmed, so only once the ride's scheduled departure time has passed
 *    (covers the no-GPS/manual flow the mobile app still supports, without
 *    letting anyone complete it *before* the ride is even due).
 * Terminal statuses are never completable (the state machine also refuses).
 */
export function canCompleteTripNow(params: {
  status: TripStatus;
  rideDepartureAt: Date;
  now: Date;
}): boolean {
  switch (params.status) {
    case 'active':
    case 'arriving':
      return true;
    case 'scheduled':
    case 'driver_approaching':
    case 'pickup':
      return params.now.getTime() >= params.rideDepartureAt.getTime();
    default:
      return false;
  }
}
