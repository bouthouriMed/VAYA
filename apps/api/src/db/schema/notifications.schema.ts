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
