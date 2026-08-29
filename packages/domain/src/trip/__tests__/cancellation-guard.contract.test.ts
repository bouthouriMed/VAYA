import { describe, it, expect } from 'vitest';
import { canCancelTrip } from '../cancellation-guard';
import type { TripStatus } from '../trip-status';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-101, INV-04) —
 * spec §36 "No Cancellation After Trip Start":
 *
 *   "Once the journey has genuinely started: cancellation is no longer
 *    permitted. This should be enforced by backend state, not merely by
 *    hiding a UI button."
 *
 * Confirmed live (this session, read directly): the booking-level guard
 * (`assertTripNotStarted`, apps/api/src/modules/bookings/bookings.service.ts
 * ~L263) IS correct — it inlines the check `trip.status !== 'scheduled'`
 * directly in the API layer rather than calling a shared `packages/domain`
 * predicate. The ride-level guard has NO such check at all: `cancelRide`
 * (apps/api/src/modules/rides/rides.service.ts ~L301-312) only calls
 * `canTransitionRideStatus(ride.status, 'cancelled')` — a ride-status
 * transition check with zero awareness of whether the ride's trip has
 * actually started. A driver can cancel a ride whose trip is `active` today.
 *
 * This file specifies the intended shared pure predicate, `canCancelTrip`,
 * deliberately NOT implemented yet (RED, Category B/C — the capability is
 * genuinely missing at the ride level, and the booking level has the right
 * behavior but the wrong location per CLAUDE.md: "the authoritative
 * state-machine location (packages/domain for ride/booking status
 * transitions) — do not reimplement transition logic elsewhere even 'just
 * for one screen'"). The intended fix once the gate is satisfied: both
 * `assertTripNotStarted` and `cancelRide` call this one function instead of
 * `cancelRide` having no check and `assertTripNotStarted` inlining its own
 * copy of the same rule — one predicate, not two independently-maintained
 * copies that could silently drift apart.
 */

describe('canCancelTrip — no cancellation once the trip has genuinely started (M-101, INV-04)', () => {
  it('a booking/ride with no trip row yet is cancellable', () => {
    expect(canCancelTrip(null)).toBe(true);
  });

  it('a trip still `scheduled` (not yet started) is cancellable', () => {
    expect(canCancelTrip('scheduled')).toBe(true);
  });

  it('INV-04 (hard invariant): once the trip has moved beyond `scheduled`, cancellation is never permitted', () => {
    const startedStatuses: TripStatus[] = ['driver_approaching', 'pickup', 'active', 'arriving'];
    for (const status of startedStatuses) {
      expect(canCancelTrip(status)).toBe(false);
    }
  });

  it('a trip already in a terminal state is not cancellable either (nothing left to cancel)', () => {
    const terminalStatuses: TripStatus[] = ['completed', 'no_show', 'cancelled'];
    for (const status of terminalStatuses) {
      expect(canCancelTrip(status)).toBe(false);
    }
  });
});
