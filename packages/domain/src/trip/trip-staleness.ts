// Live tracking (docs/domain/live-tracking.md) had no answer at all for
// "the driver forgot (or ignored) 'Terminer le trajet'" — a trip could sit
// in `active`/`arriving` forever, GPS long since stopped, nobody's rating
// prompt ever firing. World-class carpooling apps (BlaBlaCar included)
// don't leave a trip "in progress" indefinitely; this is the periodic
// safety-net half of the fix (GPS-confirmed tight-radius arrival —
// tracking-transitions.ts's DESTINATION_ARRIVED_RADIUS_M — is the other,
// faster half for the common case where the driver's phone is still
// broadcasting).

/** How long past the expected arrival before nudging both parties with a
 *  "did your trip end?" reminder. */
export const TRIP_COMPLETION_REMINDER_GRACE_MS = 30 * 60 * 1000;

/** How long past the expected arrival — combined with GPS having gone
 *  quiet for TRIP_AUTO_CLOSE_STALE_LOCATION_MS — before the system closes
 *  the trip on its own rather than waiting for a party who evidently isn't
 *  coming back to it. Deliberately generous: this only ever fires once a
 *  trip is unambiguously abandoned, never for one that's merely delayed. */
export const TRIP_AUTO_CLOSE_GRACE_MS = 3 * 60 * 60 * 1000;

/** Required *in addition to* the grace period above — a trip still
 *  actively reporting GPS is still genuinely happening (bad traffic, a long
 *  real detour), no matter how "overdue" the naive schedule math says it
 *  is, so auto-close never fires while fixes are still arriving. */
export const TRIP_AUTO_CLOSE_STALE_LOCATION_MS = 60 * 60 * 1000;

/** Fallback duration when a ride has no real OSRM/Google-derived
 *  estimatedDurationSec (a haversine-fallback route) — conservative enough
 *  not to flag ordinary short/medium rides as overdue prematurely. */
export const DEFAULT_ASSUMED_TRIP_DURATION_SEC = 2 * 60 * 60;

export type StaleTripAction = 'none' | 'remind' | 'auto_complete';

export interface StaleTripCheckInput {
  /** When the driver tapped "Démarrer le trajet" (trips.startedAt) — the
   *  one universally-available anchor, independent of the ride's own
   *  scheduled departureAt (which the trip may have started later than). */
  startedAt: Date;
  locationUpdatedAt: Date | null;
  estimatedDurationSec: number | null;
  /** Whether a reminder has already gone out for this trip (a repeat sweep
   *  shouldn't re-notify every cycle) — trips.completionReminderSentAt !=
   *  null, computed by the caller. */
  reminderAlreadySent: boolean;
  now: Date;
}

/**
 * Pure decision function for the periodic trip-staleness sweep
 * (trips.service.ts's runTripStalenessSweep) — no DB, no side effects, unit
 * -testable on its own. The caller is responsible for actually sending the
 * reminder / auto-completing and persisting whatever this returns.
 */
export function computeStaleTripAction(input: StaleTripCheckInput): StaleTripAction {
  const graceMs = (input.estimatedDurationSec ?? DEFAULT_ASSUMED_TRIP_DURATION_SEC) * 1000;
  const elapsedMs = input.now.getTime() - input.startedAt.getTime();
  const overdueMs = elapsedMs - graceMs;

  if (overdueMs < TRIP_COMPLETION_REMINDER_GRACE_MS) return 'none';

  const locationAgeMs = input.locationUpdatedAt
    ? input.now.getTime() - input.locationUpdatedAt.getTime()
    : Number.POSITIVE_INFINITY;

  if (overdueMs >= TRIP_AUTO_CLOSE_GRACE_MS && locationAgeMs >= TRIP_AUTO_CLOSE_STALE_LOCATION_MS) {
    return 'auto_complete';
  }

  if (!input.reminderAlreadySent) return 'remind';

  return 'none';
}
