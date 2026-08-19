import {
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { rides } from './rides.schema';
import { users } from './users.schema';

export const bookingStatusEnum = pgEnum('booking_status', [
  'pending',
  'accepted',
  'declined',
  'cancelled_by_rider',
  'cancelled_by_driver',
  'expired',
  'completed',
  'no_show',
]);

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  rideId: uuid('ride_id')
    .notNull()
    .references(() => rides.id, { onDelete: 'cascade' }),
  riderId: uuid('rider_id')
    .notNull()
    .references(() => users.id),
  seatsRequested: integer('seats_requested').notNull(),
  contributionTotal: doublePrecision('contribution_total').notNull(),
  status: bookingStatusEnum('status').notNull().default('pending'),
  pickupLabel: varchar('pickup_label', { length: 140 }).notNull(),
  pickupLat: doublePrecision('pickup_lat').notNull(),
  pickupLng: doublePrecision('pickup_lng').notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
