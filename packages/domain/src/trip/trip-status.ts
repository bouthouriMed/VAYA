export const TRIP_STATUSES = [
  'scheduled',
  'driver_approaching',
  'pickup',
  'active',
  'arriving',
  'completed',
  'no_show',
  'cancelled',
] as const;

export type TripStatus = (typeof TRIP_STATUSES)[number];

// Phase 9 (docs/roadmap/phase-09-ratings-trust.md) added a direct
// `completed` edge from every non-terminal status, not just `arriving`.
// Before this phase, nothing in apps/api ever called this state machine at
// all — trips were created `scheduled` by bookings.service.ts's
// acceptBooking and never progressed (verified: no other caller of
// canTransitionTripStatus existed anywhere in the codebase). Ratings need
// a real trip-completion trigger to function, and this app's mobile
// trip-progress screens (bookings/pending -> pickup -> live -> settlement)
// are still a presentational mock with no live position feed driving them
// through the intermediate statuses one at a time (live.tsx's own comment:
// "there's no real-time position feed"). Rather than build a full
// trip-simulation/lifecycle feature (explicitly out of scope for this
// phase), the new `POST /trips/:id/complete` endpoint
// (apps/api/src/modules/trips) lets either party declare the trip over
// from wherever it currently stands — hence `completed` reachable from
// every non-terminal state, not gated behind first passing through
// `driver_approaching`/`pickup`/`active`/`arriving`.
//
// Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md) applies the same
// reasoning to `no_show`: previously only reachable from `pickup`, which
// assumed the trip had already progressed there through a real simulation.
// Since that simulation still doesn't exist, a no-show reported near
// `departureAt` almost always finds the trip still `scheduled` — so
// `no_show`, like `completed`, is now reachable from every non-terminal
// status, not just `pickup`.
export const TRIP_STATUS_TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  scheduled: ['driver_approaching', 'completed', 'no_show', 'cancelled'],
  driver_approaching: ['pickup', 'completed', 'no_show', 'cancelled'],
  pickup: ['active', 'no_show', 'completed', 'cancelled'],
  active: ['arriving', 'completed', 'no_show', 'cancelled'],
  arriving: ['completed', 'no_show'],
  completed: [],
  no_show: [],
  cancelled: [],
};

export function canTransitionTripStatus(from: TripStatus, to: TripStatus): boolean {
  return TRIP_STATUS_TRANSITIONS[from].includes(to);
}
