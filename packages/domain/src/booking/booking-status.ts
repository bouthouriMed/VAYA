export const BOOKING_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'cancelled_by_rider',
  'cancelled_by_driver',
  'expired',
  'completed',
  'no_show',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['accepted', 'declined', 'cancelled_by_rider', 'expired'],
  accepted: ['cancelled_by_rider', 'cancelled_by_driver', 'completed', 'no_show'],
  declined: [],
  cancelled_by_rider: [],
  cancelled_by_driver: [],
  expired: [],
  completed: [],
  no_show: [],
};

export function canTransitionBookingStatus(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_STATUS_TRANSITIONS[from].includes(to);
}
