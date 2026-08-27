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
  // started the journey to pickup" — this adds the remaining two states a
  // passenger needs mid-journey.
  'trip_arriving',
  'trip_tracking_unavailable',
  // Admin verification workflow (docs/domain/verification-workflow.md).
  'verification_submitted',
  'verification_approved',
  'verification_declined',
  'verification_resubmission_required',
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
