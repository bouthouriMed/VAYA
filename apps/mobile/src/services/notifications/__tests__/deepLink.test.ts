import { describe, it, expect } from 'vitest';
import { resolveNotificationDeepLink } from '../deepLink';

const RIDER = { bookingId: 'b1', rideId: 'r1', role: 'rider' };
const DRIVER = { bookingId: 'b1', rideId: 'r1', role: 'driver' };

describe('resolveNotificationDeepLink', () => {
  it('opens the ride a driver must answer a request on', () => {
    expect(resolveNotificationDeepLink('booking_requested', DRIVER)).toBe('/(tabs)/trips?openRequestsForRide=r1');
    expect(resolveNotificationDeepLink('booking_deadline_approaching', DRIVER)).toBe('/(tabs)/trips?openRequestsForRide=r1');
  });

  it("opens a rider's booking for booking outcomes, and the driver's ride hub for theirs", () => {
    for (const type of ['booking_accepted', 'booking_declined', 'booking_sibling_cancelled', 'booking_cancelled', 'booking_no_show_reported']) {
      expect(resolveNotificationDeepLink(type, RIDER), type).toBe('/bookings/b1');
    }
    expect(resolveNotificationDeepLink('booking_cancelled', DRIVER)).toBe('/driver/rides/r1');
    expect(resolveNotificationDeepLink('booking_no_show_reported', DRIVER)).toBe('/driver/rides/r1');
  });

  it('opens the exact conversation for a message', () => {
    expect(resolveNotificationDeepLink('message_received', RIDER)).toBe('/conversations/b1');
  });

  it('opens the live trip for a rider and the ride hub for a driver', () => {
    for (const type of [
      'trip_driver_approaching',
      'trip_pickup_arrived',
      'trip_passenger_onboard',
      'trip_active',
      'trip_route_deviation',
      'trip_eta_changed',
      'trip_tracking_unavailable',
      'trip_arriving',
    ]) {
      expect(resolveNotificationDeepLink(type, RIDER), type).toBe('/bookings/live?bookingId=b1');
      expect(resolveNotificationDeepLink(type, DRIVER), type).toBe('/driver/rides/r1');
    }
  });

  it('routes the remaining types to their screen', () => {
    expect(resolveNotificationDeepLink('trip_completed', RIDER)).toBe('/(tabs)/trips');
    expect(resolveNotificationDeepLink('trip_completion_reminder', DRIVER)).toBe('/(tabs)/trips');
    expect(resolveNotificationDeepLink('rating_received')).toBe('/(tabs)/profile');
    expect(resolveNotificationDeepLink('recurring_proactive_match')).toBe('/recurring');
    expect(resolveNotificationDeepLink('demand_signal_matched')).toBe('/(tabs)/explore');
    expect(resolveNotificationDeepLink('verification_approved')).toBe('/driver/onboarding/confirmation');
    expect(resolveNotificationDeepLink('verification_resubmission_required')).toBe('/driver/onboarding/resubmit');
    expect(resolveNotificationDeepLink('legal_update', { version: '2.1' })).toBe('/legal/updates');
  });

  it('falls back to "Mes trajets" when an id is missing, and null for an unknown type', () => {
    expect(resolveNotificationDeepLink('booking_requested')).toBe('/(tabs)/trips');
    expect(resolveNotificationDeepLink('booking_accepted', {})).toBe('/(tabs)/trips');
    expect(resolveNotificationDeepLink('trip_active', { role: 'driver' })).toBe('/(tabs)/trips');
    expect(resolveNotificationDeepLink('message_received')).toBe('/(tabs)/trips');
    expect(resolveNotificationDeepLink('something_new')).toBeNull();
  });
});
