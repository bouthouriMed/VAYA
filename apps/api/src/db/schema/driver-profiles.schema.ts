import {
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const verificationStatusEnum = pgEnum('verification_status', [
  'pending',
  'approved',
  'rejected',
]);

export const driverProfiles = pgTable('driver_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  verificationStatus: verificationStatusEnum('verification_status').notNull().default('pending'),
  bio: text('bio'),
  ratingAvg: doublePrecision('rating_avg').notNull().default(0),
  tripCount: integer('trip_count').notNull().default(0),
  punctualityScore: doublePrecision('punctuality_score').notNull().default(0),
  reliabilityScore: doublePrecision('reliability_score').notNull().default(0),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
