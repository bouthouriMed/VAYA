import {
  doublePrecision,
  index,
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

export const rides = pgTable(
  'rides',
  {
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
    // Route-selection step (rides/route-options.service.ts): which kind of
    // route alternative the driver picked ('fastest' | 'no_tolls' |
    // 'no_highways' | 'alternative'), or null for a ride created before
    // this feature existed / whose route token had already expired at
    // creation time — never backfilled, absence just means "unknown," not
    // "fastest." Free text rather than a pgEnum: it mirrors
    // RouteOptionKind (lib/routing-providers/routing-provider.types.ts), a
    // TS-only type with no schema-level enum equivalent yet, and a new kind
    // added there later shouldn't require a migration here too.
    routeKind: varchar('route_kind', { length: 32 }),
    recurringPatternId: uuid('recurring_pattern_id').references(() => recurringPatterns.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Matches matching.service.ts's hot-path filter: published rides within
    // a departure time window.
    statusDepartureAtIdx: index('rides_status_departure_at_idx').on(
      table.status,
      table.departureAt,
    ),
    driverProfileIdIdx: index('rides_driver_profile_id_idx').on(table.driverProfileId),
    vehicleIdIdx: index('rides_vehicle_id_idx').on(table.vehicleId),
    routeIdIdx: index('rides_route_id_idx').on(table.routeId),
  }),
);
