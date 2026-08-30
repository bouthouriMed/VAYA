import { jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const notificationEventTypeEnum = pgEnum('notification_event_type', [
  'booking_requested',
  'booking_accepted',
  'booking_declined',
  'trip_driver_approaching',
  'trip_completed',
  'recurring_pattern_detected',
  'recurring_proactive_match',
  'demand_signal_matched',
  'message_received',
  // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md).
  'booking_cancelled',
  'booking_no_show_reported',
  // Live tracking (docs/domain/live-tracking.md). trip_driver_approaching
  // above (previously schema-only, never dispatched) is reused for "driver
  // started the journey to pickup" — this adds the remaining states a
  // passenger needs mid-journey. trip_pickup_arrived added later: the
  // driver_approaching -> pickup proximity auto-transition updated the trip
  // row but never actually told the rider their driver had arrived.
  'trip_arriving',
  'trip_tracking_unavailable',
  'trip_pickup_arrived',
  // Journey-contract second pass (docs/unified_driver_and_passenger_journey.md
  // §33, §51, M-096/097, EDGE-051) — see @vaya/domain's
  // notification-event.types.ts doc comment for the full reasoning.
  'trip_passenger_onboard',
  'trip_route_deviation',
  // Trip-staleness sweep (packages/domain/src/trip/trip-staleness.ts) — a
  // trip still non-terminal well past its expected arrival gets one
  // reminder nudge before the sweep eventually closes it on its own.
  'trip_completion_reminder',
  // Admin verification workflow (docs/domain/verification-workflow.md).
  'verification_submitted',
  'verification_approved',
  'verification_declined',
  'verification_resubmission_required',
  // Ratings & trust (docs/domain/model.md): ratings.service.ts's createRating
  // notifies whichever party was just rated.
  'rating_received',
  // M-113 (docs/unified_driver_and_passenger_journey.md §39, journey-contract
  // second pass): closes the 4 structurally-missing event types
  // notification-event-coverage.contract.test.ts's own "documents the exact
  // current event surface" test previously confirmed absent from this enum
  // entirely (not just undispatched).
  //
  // "request deadline approaching" — a one-time reminder to the DRIVER
  // (they're the one who needs to act) before a pending request's
  // M-054 expiresAt lapses (bookings.service.ts's runBookingExpirySweep).
  'booking_deadline_approaching',
  // "other passenger requests cancelled" — was silently reusing
  // 'booking_declined' with a reason code (bookings.service.ts's
  // acceptBooking, M-055's sibling-supersede notification) — a real,
  // distinct event type now, not conflated with an ordinary decline.
  'booking_sibling_cancelled',
  // "live journey started" — the pickup -> active transition
  // (trips.service.ts's confirmPassengerAboard and its GPS-inferred
  // counterpart), distinct from 'trip_passenger_onboard' (which already
  // fires at the same moment for the rider specifically): this one is the
  // driver-facing "you are now live" signal the spec names separately.
  'trip_active',
  // "route/ETA changed" (the ETA-only half — 'trip_route_deviation' above
  // already covers the route half) — dispatched only when a live ETA
  // recompute (trips.service.ts's updateTripLocation) changes by more than
  // a meaningful threshold from the last one a rider was actually told
  // about, never on every ~20s recompute (that stays WebSocket-only, per
  // M-114's "no notification spam from routine pings" invariant).
  'trip_eta_changed',
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: notificationEventTypeEnum('type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
