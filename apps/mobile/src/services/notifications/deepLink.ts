/**
 * Maps a tapped notification to the screen where its next step happens.
 *
 * The server attaches the ids and the recipient's side of the booking to
 * every push it sends (notifications.service.ts → loadNotificationContext:
 * `bookingId`, `rideId`, `role`), so a tap lands on the exact booking or
 * ride the notification is about — not just the app's home. Every pushable
 * type resolves somewhere; a missing id falls back to "Mes trajets", where
 * the user's bookings and rides are listed.
 *
 * - Requests a driver must answer open that ride's hub, where Accept/Decline
 *   sit inline (via trips' `openRequestsForRide`, so Back returns to the
 *   dashboard).
 * - A rider's booking outcomes open the booking itself; live-trip updates
 *   open the live screen; messages open the conversation.
 * - A driver's booking/trip updates open the ride hub.
 */
export type NotificationDeepLinkType =
  | 'booking_requested'
  | 'booking_deadline_approaching'
  | 'booking_accepted'
  | 'booking_declined'
  | 'booking_cancelled'
  | 'booking_sibling_cancelled'
  | 'booking_no_show_reported'
  | 'message_received'
  | 'trip_driver_approaching'
  | 'trip_pickup_arrived'
  | 'trip_passenger_onboard'
  | 'trip_active'
  | 'trip_route_deviation'
  | 'trip_eta_changed'
  | 'trip_tracking_unavailable'
  | 'trip_arriving'
  | 'trip_completed'
  | 'trip_completion_reminder'
  | 'rating_received'
  | 'recurring_pattern_detected'
  | 'recurring_proactive_match'
  | 'demand_signal_matched'
  | 'verification_submitted'
  | 'verification_approved'
  | 'verification_declined'
  | 'verification_resubmission_required'
  | 'legal_update'
  | (string & {});

const TRIPS = '/(tabs)/trips';

const id = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function resolveNotificationDeepLink(
  type: NotificationDeepLinkType,
  payload?: Record<string, unknown>,
): string | null {
  const bookingId = id(payload?.bookingId);
  const rideId = id(payload?.rideId);
  const isDriver = payload?.role === 'driver';

  const rideRequests = rideId ? `${TRIPS}?openRequestsForRide=${encodeURIComponent(rideId)}` : TRIPS;
  const booking = bookingId ? `/bookings/${encodeURIComponent(bookingId)}` : TRIPS;
  const live = bookingId ? `/bookings/live?bookingId=${encodeURIComponent(bookingId)}` : TRIPS;
  const rideHub = rideId ? `/driver/rides/${encodeURIComponent(rideId)}` : TRIPS;

  switch (type) {
    // Something for the driver to answer.
    case 'booking_requested':
    case 'booking_deadline_approaching':
      return rideRequests;

    // A rider's booking outcome; for a driver, the ride it affects.
    case 'booking_accepted':
    case 'booking_declined':
    case 'booking_sibling_cancelled':
    case 'booking_cancelled':
    case 'booking_no_show_reported':
      return isDriver ? rideHub : booking;

    case 'message_received':
      return bookingId ? `/conversations/${encodeURIComponent(bookingId)}` : TRIPS;

    // Live trip: the rider follows it live; the driver runs it from the hub.
    case 'trip_driver_approaching':
    case 'trip_pickup_arrived':
    case 'trip_passenger_onboard':
    case 'trip_active':
    case 'trip_route_deviation':
    case 'trip_eta_changed':
    case 'trip_tracking_unavailable':
    case 'trip_arriving':
      return isDriver ? rideHub : live;

    // Rating prompts surface globally (RatingPromptBridge); "Mes trajets"
    // is where both sides can finish the trip.
    case 'trip_completed':
    case 'trip_completion_reminder':
      return TRIPS;

    case 'rating_received':
      return '/(tabs)/profile';

    case 'recurring_pattern_detected':
    case 'recurring_proactive_match':
      return '/recurring';

    case 'demand_signal_matched':
      return '/(tabs)/explore';

    case 'verification_submitted':
    case 'verification_approved':
    case 'verification_declined':
      return '/driver/onboarding/confirmation';
    case 'verification_resubmission_required':
      return '/driver/onboarding/resubmit';

    case 'legal_update':
      return '/legal/updates';

    default:
      return null;
  }
}
