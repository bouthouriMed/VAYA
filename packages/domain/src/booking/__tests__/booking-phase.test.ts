import { describe, expect, it } from 'vitest';
import { BOOKING_STATUSES } from '../booking-status';
import { BOOKING_PHASES, deriveBookingPhase, isFinishedBookingPhase } from '../booking-phase';

describe('deriveBookingPhase', () => {
  it('a pending request is awaiting the driver', () => {
    expect(deriveBookingPhase('pending')).toBe('awaiting_response');
  });

  it('an accepted booking on a ride that has not started is confirmed, not "in progress"', () => {
    expect(deriveBookingPhase('accepted', { rideStatus: 'published', tripStatus: 'scheduled' })).toBe('confirmed');
    expect(deriveBookingPhase('accepted')).toBe('confirmed');
  });

  it('an accepted booking is in progress once the trip is live or the ride started', () => {
    expect(deriveBookingPhase('accepted', { tripStatus: 'driver_approaching' })).toBe('in_progress');
    expect(deriveBookingPhase('accepted', { tripStatus: 'active' })).toBe('in_progress');
    expect(deriveBookingPhase('accepted', { rideStatus: 'in_progress' })).toBe('in_progress');
  });

  it('an accepted booking follows a finished trip or ride', () => {
    expect(deriveBookingPhase('accepted', { tripStatus: 'completed' })).toBe('completed');
    expect(deriveBookingPhase('accepted', { rideStatus: 'completed' })).toBe('completed');
    expect(deriveBookingPhase('accepted', { tripStatus: 'no_show' })).toBe('no_show');
    expect(deriveBookingPhase('accepted', { rideStatus: 'cancelled' })).toBe('cancelled_by_driver');
  });

  it('every booking status maps to a known phase (including superseded)', () => {
    for (const status of BOOKING_STATUSES) {
      expect(BOOKING_PHASES).toContain(deriveBookingPhase(status));
    }
  });

  it('only awaiting, confirmed and in-progress bookings are unfinished', () => {
    expect(BOOKING_PHASES.filter((p) => !isFinishedBookingPhase(p))).toEqual([
      'awaiting_response',
      'confirmed',
      'in_progress',
    ]);
  });
});
