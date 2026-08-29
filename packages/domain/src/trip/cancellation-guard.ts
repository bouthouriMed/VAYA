import type { TripStatus } from './trip-status';

/**
 * No Cancellation After Trip Start (spec §36, hard invariant §62 — matrix
 * M-101/INV-04): "Once the journey has genuinely started, cancellation is no
 * longer permitted. This should be enforced by backend state, not merely by
 * hiding a UI button."
 *
 * The single shared predicate both the booking-level guard
 * (`bookings.service.ts`'s `assertTripNotStarted`) and the ride-level guard
 * (`rides.service.ts`'s `cancelRide`) call, so the rule can never silently
 * drift between the two (CLAUDE.md: "the authoritative state-machine
 * location — do not reimplement transition logic elsewhere even 'just for
 * one screen'"). A booking/ride with no trip row yet, or whose trip is still
 * `scheduled`, is cancellable; anything beyond that — including an already
 * terminal trip, where there is nothing left to cancel — is not.
 *
 * Pure function: no I/O.
 */
export function canCancelTrip(tripStatus: TripStatus | null): boolean {
  if (tripStatus === null) return true;
  return tripStatus === 'scheduled';
}
