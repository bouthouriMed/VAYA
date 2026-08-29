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

  it('FAIL (missing, M-113): "request deadline approaching" has no event type at all', () => {
    expect(EXISTING_EVENTS.has('booking_deadline_approaching')).toBe(false);
  });

  it('FAIL (missing, M-113/M-055): "other passenger requests cancelled" (sibling-cancellation) has no event type at all', () => {
    expect(EXISTING_EVENTS.has('booking_sibling_cancelled')).toBe(false);
    expect(EXISTING_EVENTS.has('request_group_closed')).toBe(false);
  });

  it('FAIL (missing, M-113): "passenger onboard" has no distinct event type — confirmPassengerAboard only broadcasts over WebSocket, per the audit', () => {
    expect(EXISTING_EVENTS.has('passenger_onboard')).toBe(false);
    expect(EXISTING_EVENTS.has('trip_passenger_onboard')).toBe(false);
  });

  it('FAIL (missing, M-113): "live journey started" has no distinct event type', () => {
    expect(EXISTING_EVENTS.has('trip_active')).toBe(false);
    expect(EXISTING_EVENTS.has('live_journey_started')).toBe(false);
  });

  it('FAIL (missing, M-113): "route/ETA changed" has no event type — ETA recompute is WebSocket-only, never persisted/pushed as a notification', () => {
    expect(EXISTING_EVENTS.has('trip_eta_changed')).toBe(false);
    expect(EXISTING_EVENTS.has('route_changed')).toBe(false);
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
        'trip_completion_reminder',
        'verification_submitted',
        'verification_approved',
        'verification_declined',
        'verification_resubmission_required',
        'rating_received',
      ]),
    );
  });
});
