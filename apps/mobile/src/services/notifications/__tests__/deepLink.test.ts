import { describe, it, expect } from 'vitest';
import { resolveNotificationDeepLink } from '../deepLink';

describe('resolveNotificationDeepLink', () => {
  it.each(['booking_accepted', 'booking_declined', 'trip_completed'])(
    'resolves %s to the trips tab',
    (type) => {
      expect(resolveNotificationDeepLink(type)).toBe('/(tabs)/trips');
    },
  );

  it('falls back to the plain trips tab for booking_requested without a rideId', () => {
    expect(resolveNotificationDeepLink('booking_requested')).toBe('/(tabs)/trips');
    expect(resolveNotificationDeepLink('booking_requested', {})).toBe('/(tabs)/trips');
  });

  it('resolves booking_requested directly to that ride\'s request sheet when rideId is present', () => {
    expect(resolveNotificationDeepLink('booking_requested', { rideId: 'ride-1' })).toBe(
      '/(tabs)/trips?openRequestsForRide=ride-1',
    );
  });

  it('returns null for an event type this phase does not dispatch a tap-through for', () => {
    expect(resolveNotificationDeepLink('trip_driver_approaching')).toBeNull();
    expect(resolveNotificationDeepLink('demand_signal_matched')).toBeNull();
  });

  it('returns null for an unknown type rather than throwing', () => {
    expect(resolveNotificationDeepLink('something_unexpected')).toBeNull();
  });

  it('resolves message_received to the exact conversation when bookingId is present', () => {
    expect(resolveNotificationDeepLink('message_received', { bookingId: 'b1' })).toBe(
      '/conversations/b1',
    );
  });

  it('falls back to the trips tab for message_received without a bookingId', () => {
    expect(resolveNotificationDeepLink('message_received')).toBe('/(tabs)/trips');
    expect(resolveNotificationDeepLink('message_received', {})).toBe('/(tabs)/trips');
  });

  it.each(['trip_arriving', 'trip_tracking_unavailable'])(
    'resolves live-tracking event %s to the trips tab',
    (type) => {
      expect(resolveNotificationDeepLink(type, { tripId: 't1', bookingId: 'b1' })).toBe('/(tabs)/trips');
    },
  );

  it.each(['verification_submitted', 'verification_approved', 'verification_declined'])(
    'resolves verification event %s to the confirmation screen',
    (type) => {
      expect(resolveNotificationDeepLink(type)).toBe('/driver/onboarding/confirmation');
    },
  );

  it('resolves verification_resubmission_required directly to the resubmit screen', () => {
    expect(resolveNotificationDeepLink('verification_resubmission_required')).toBe(
      '/driver/onboarding/resubmit',
    );
  });
});
