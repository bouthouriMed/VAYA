import {
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { routes } from './routes.schema';

export const recurringPatternRoleEnum = pgEnum('recurring_pattern_role', ['rider', 'driver']);

export const recurringPatternStatusEnum = pgEnum('recurring_pattern_status', [
  'detected',
  'suggested',
  'enabled',
  'dismissed',
]);

export const recurringPatterns = pgTable('recurring_patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: recurringPatternRoleEnum('role').notNull(),
  routeId: uuid('route_id').references(() => routes.id),
  originLabel: varchar('origin_label', { length: 140 }).notNull(),
  originLat: doublePrecision('origin_lat').notNull(),
  originLng: doublePrecision('origin_lng').notNull(),
  destinationLabel: varchar('destination_label', { length: 140 }).notNull(),
  destinationLat: doublePrecision('destination_lat').notNull(),
  destinationLng: doublePrecision('destination_lng').notNull(),
  daysOfWeekMask: integer('days_of_week_mask').notNull(),
  timeWindowStart: varchar('time_window_start', { length: 5 }).notNull(),
  timeWindowEnd: varchar('time_window_end', { length: 5 }).notNull(),
  confidenceScore: doublePrecision('confidence_score').notNull(),
  status: recurringPatternStatusEnum('status').notNull().default('detected'),
  lastMatchedAt: timestamp('last_matched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
