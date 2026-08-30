import { describe, it, expect } from 'vitest';
import { notificationEventTypeEnum } from '../../../db/schema/notifications.schema.js';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-113, spec §39
 * "Notifications") — spec's literal 12-item event list:
 *
 *   request received, request deadline approaching, request accepted,
 *   other passenger requests cancelled, driver trip started,
 *   pickup approaching, passenger onboard, live journey started,
 *   route/ETA changed, cancellation, no-show, trip completed,
 *   review requested
 *
 * This is a schema-level structural check (no DB connection needed — a
 * drizzle pgEnum's `.enumValues` is a plain in-memory array) rather than a
 * dispatch-behavior test: it answers "does the event TYPE even exist to be
 * dispatched" before any question of "is it actually dispatched when it
 * should be" (a separate, deeper question already answered for the
 * existing types by bookings-notifications.integration.test.ts and
 * ratings-notification.integration.test.ts elsewhere in this codebase).
 *
 * All 4 previously-structurally-missing event types (booking_deadline_
 * approaching, booking_sibling_cancelled, trip_active, trip_eta_changed)
 * are now real, dispatched event types — see each real dispatch site's own
 * doc comment (bookings.service.ts's runBookingExpirySweep/acceptBooking,
 * trips.service.ts's confirmPassengerAboard/updateTripLocation).
 */
const EXISTING_EVENTS = new Set(notificationEventTypeEnum.enumValues as readonly string[]);

describe('notification event coverage — spec §39\'s 12-item list vs. the real schema enum (M-113)', () => {
  it('request received -> booking_requested exists', () => {
    expect(EXISTING_EVENTS.has('booking_requested')).toBe(true);
  });

  it('request accepted -> booking_accepted exists', () => {
    expect(EXISTING_EVENTS.has('booking_accepted')).toBe(true);
  });

  it('cancellation -> booking_cancelled exists', () => {
    expect(EXISTING_EVENTS.has('booking_cancelled')).toBe(true);
  });

  it('no-show -> booking_no_show_reported exists', () => {
    expect(EXISTING_EVENTS.has('booking_no_show_reported')).toBe(true);
  });

  it('trip completed -> trip_completed exists', () => {
    expect(EXISTING_EVENTS.has('trip_completed')).toBe(true);
  });

  it('pickup approaching -> trip_arriving / trip_pickup_arrived exist (conflated-but-functional, per audit)', () => {
    expect(EXISTING_EVENTS.has('trip_arriving')).toBe(true);
    expect(EXISTING_EVENTS.has('trip_pickup_arrived')).toBe(true);
  });

  it('driver trip started -> reuses trip_driver_approaching (conflated-but-functional, documented not a gap)', () => {
    expect(EXISTING_EVENTS.has('trip_driver_approaching')).toBe(true);
  });

  it('review requested -> reuses trip_completed as the trigger (conflated-but-functional, by design per Phase 9)', () => {
    // No distinct 'review_requested' event exists; this documents that this
    // is a deliberate reuse, not an accidental omission (Phase 9 notes).
    expect(EXISTING_EVENTS.has('review_requested')).toBe(false);
  });

  it('RESOLVED (M-113): "request deadline approaching" -> booking_deadline_approaching now exists, dispatched once per pending booking by runBookingExpirySweep\'s new reminder pass (bookings.service.ts)', () => {
    expect(EXISTING_EVENTS.has('booking_deadline_approaching')).toBe(true);
  });

  it('RESOLVED (M-113/M-055): "other passenger requests cancelled" -> booking_sibling_cancelled now exists, replacing the previous conflated reuse of booking_declined in acceptBooking\'s sibling-supersede notification', () => {
    expect(EXISTING_EVENTS.has('booking_sibling_cancelled')).toBe(true);
  });

  it('RESOLVED (M-113, journey-contract second pass): "passenger onboard" -> trip_passenger_onboard now exists, dispatched from both the auto-boarding-inference path and the manual confirmPassengerAboard tap (trips.service.ts)', () => {
    expect(EXISTING_EVENTS.has('trip_passenger_onboard')).toBe(true);
  });

  it('RESOLVED (M-113): "live journey started" -> trip_active now exists, dispatched to the driver (distinct from the rider-facing trip_passenger_onboard) from both the manual confirmPassengerAboard tap and its GPS-inferred counterpart', () => {
    expect(EXISTING_EVENTS.has('trip_active')).toBe(true);
  });

  it('RESOLVED (M-113/M-090, journey-contract second pass): "route ... changed" -> trip_route_deviation (unchanged, dispatched once per genuine, non-noise deviation) AND "... ETA changed" in isolation -> trip_eta_changed now exists too, dispatched only when a live ETA recompute drifts past ETA_CHANGE_NOTIFY_THRESHOLD_SEC from the last one a rider was told about — never on every ~20s recompute', () => {
    expect(EXISTING_EVENTS.has('trip_route_deviation')).toBe(true);
    expect(EXISTING_EVENTS.has('trip_eta_changed')).toBe(true);
  });

  it('documents the exact current event surface, so a future addition updates this test deliberately rather than silently', () => {
    expect(new Set(EXISTING_EVENTS)).toEqual(
      new Set([
        'booking_requested',
        'booking_accepted',
        'booking_declined',
        'trip_driver_approaching',
        'trip_completed',
        'recurring_pattern_detected',
        'recurring_proactive_match',
        'demand_signal_matched',
        'message_received',
        'booking_cancelled',
        'booking_no_show_reported',
        'trip_arriving',
        'trip_tracking_unavailable',
        'trip_pickup_arrived',
        'trip_passenger_onboard',
        'trip_route_deviation',
        'trip_completion_reminder',
        'verification_submitted',
        'verification_approved',
        'verification_declined',
        'verification_resubmission_required',
        'rating_received',
        'booking_deadline_approaching',
        'booking_sibling_cancelled',
        'trip_active',
        'trip_eta_changed',
      ]),
    );
  });
});
