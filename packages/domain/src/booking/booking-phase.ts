import type { BookingStatus } from './booking-status';
import type { RideStatus } from '../ride/ride-status';
import type { TripStatus } from '../trip/trip-status';

/**
 * What a booking means to the people involved right now — the one answer
 * every screen shows for "where is this booking at".
 *
 * `booking.status` alone can't answer it: a booking stays `accepted` from
 * the moment the driver says yes until the trip ends, so a screen that only
 * reads the booking status has to guess whether the trip has started. Three
 * screens used to guess three different ways for the same booking
 * ("Accepté", "En cours", "Trajet à venir"). This derives the phase once,
 * from the booking plus the ride and trip states the server returned.
 */
export const BOOKING_PHASES = [
  'awaiting_response',
  'confirmed',
  'in_progress',
  'completed',
  'declined',
  'cancelled_by_rider',
  'cancelled_by_driver',
  'expired',
  'superseded',
  'no_show',
] as const;

export type BookingPhase = (typeof BOOKING_PHASES)[number];

/** Trip states in which the car is actually on its way or under way. */
const LIVE_TRIP_STATUSES: readonly TripStatus[] = ['driver_approaching', 'pickup', 'active', 'arriving'];

export interface BookingPhaseContext {
  rideStatus?: RideStatus | null;
  tripStatus?: TripStatus | null;
}

export function deriveBookingPhase(status: BookingStatus, context: BookingPhaseContext = {}): BookingPhase {
  const { rideStatus, tripStatus } = context;
  switch (status) {
    case 'pending':
      return 'awaiting_response';
    case 'accepted':
      if (tripStatus === 'completed' || rideStatus === 'completed') return 'completed';
      if (tripStatus === 'no_show') return 'no_show';
      if (tripStatus === 'cancelled' || rideStatus === 'cancelled') return 'cancelled_by_driver';
      if ((tripStatus != null && LIVE_TRIP_STATUSES.includes(tripStatus)) || rideStatus === 'in_progress') {
        return 'in_progress';
      }
      return 'confirmed';
    default:
      return status;
  }
}

/** Phases from which the booking can no longer change. */
export function isFinishedBookingPhase(phase: BookingPhase): boolean {
  return phase !== 'awaiting_response' && phase !== 'confirmed' && phase !== 'in_progress';
}
