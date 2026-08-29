export const BOOKING_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'cancelled_by_rider',
  'cancelled_by_driver',
  'expired',
  'completed',
  'no_show',
  // Journey-contract second pass (docs/unified_driver_and_passenger_journey.md
  // §20, M-055/M-056): a passenger may hold up to MAX_ACTIVE_REQUESTS_PER_JOURNEY
  // pending requests for the same journey across different rides/drivers.
  // The instant one is accepted, every other still-pending request for
  // that same journey closes automatically — a distinct terminal state
  // from every existing one (not a real cancellation by either party, not
  // an expiry, not a decline) so a passenger's own history honestly
  // reflects "another driver got there first" rather than a fabricated
  // reason.
  'superseded',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['accepted', 'declined', 'cancelled_by_rider', 'expired', 'superseded'],
  accepted: ['cancelled_by_rider', 'cancelled_by_driver', 'completed', 'no_show'],
  declined: [],
  cancelled_by_rider: [],
  cancelled_by_driver: [],
  expired: [],
  completed: [],
  no_show: [],
  superseded: [],
};

export function canTransitionBookingStatus(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_STATUS_TRANSITIONS[from].includes(to);
}
