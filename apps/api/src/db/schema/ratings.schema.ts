import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { trips } from './trips.schema';
import { users } from './users.schema';

export const ratingRoleEnum = pgEnum('rating_role', ['rider_rates_driver', 'driver_rates_rider']);

export const ratings = pgTable('ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  raterUserId: uuid('rater_user_id')
    .notNull()
    .references(() => users.id),
  rateeUserId: uuid('ratee_user_id')
    .notNull()
    .references(() => users.id),
  role: ratingRoleEnum('role').notNull(),
  stars: integer('stars').notNull(),
  punctualityFlag: boolean('punctuality_flag'),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
