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
