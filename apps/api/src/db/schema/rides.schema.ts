import {
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { driverProfiles } from './driver-profiles.schema';
import { vehicles } from './vehicles.schema';
import { routes } from './routes.schema';
import { recurringPatterns } from './recurring-patterns.schema';

export const rideStatusEnum = pgEnum('ride_status', [
  'draft',
  'published',
  'full',
  'in_progress',
  'completed',
  'cancelled',
]);

export const rides = pgTable('rides', {
  id: uuid('id').primaryKey().defaultRandom(),
  driverProfileId: uuid('driver_profile_id')
    .notNull()
    .references(() => driverProfiles.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id')
    .notNull()
    .references(() => vehicles.id),
  routeId: uuid('route_id').references(() => routes.id),
  originLabel: varchar('origin_label', { length: 140 }).notNull(),
  originLat: doublePrecision('origin_lat').notNull(),
  originLng: doublePrecision('origin_lng').notNull(),
  destinationLabel: varchar('destination_label', { length: 140 }).notNull(),
  destinationLat: doublePrecision('destination_lat').notNull(),
  destinationLng: doublePrecision('destination_lng').notNull(),
  departureAt: timestamp('departure_at', { withTimezone: true }).notNull(),
  seatsTotal: integer('seats_total').notNull(),
  seatsAvailable: integer('seats_available').notNull(),
  contributionPerSeat: doublePrecision('contribution_per_seat').notNull(),
  status: rideStatusEnum('status').notNull().default('draft'),
  routePolyline: text('route_polyline'),
  estimatedDurationSec: integer('estimated_duration_sec'),
  recurringPatternId: uuid('recurring_pattern_id').references(() => recurringPatterns.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
