import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { rides } from './rides.schema';

/**
 * Candidate (and, once selected, active) pickup/drop-off points along a
 * ride's actual road route — see docs/domain/ride-engine.md for the full
 * generation/scoring design. A ride has many stops; `isDriverSelected`
 * distinguishes the driver's final offer set from the wider candidate pool
 * generation produced (the driver's editing view can still see rejected-
 * but-kept candidates, passengers only ever see `isDriverSelected = true`).
 */
export const routeStops = pgTable(
  'route_stops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    // Order along the route, origin = 0.
    sequence: integer('sequence').notNull(),
    label: varchar('label', { length: 140 }).notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    // Did OSRM's `nearest` snap succeed for this sample.
    roadSnapped: boolean('road_snapped').notNull().default(false),
    // Driver detour cost (there-and-back) to serve this stop.
    deviationMeters: integer('deviation_meters').notNull().default(0),
    deviationSeconds: integer('deviation_seconds').notNull().default(0),
    // 0-1, from stop-candidates.service.ts's scoring function.
    suitabilityScore: doublePrecision('suitability_score').notNull().default(0),
    // Inferred road classification — see stop-candidates.service.ts for how
    // (this OSRM deployment doesn't expose a direct way-class tag).
    roadClass: varchar('road_class', { length: 30 }),
    // Driver opted into offering this candidate to passengers.
    isDriverSelected: boolean('is_driver_selected').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    rideIdIdx: index('route_stops_ride_id_idx').on(table.rideId),
    // Backs the passenger-facing query: only this ride's selected stops.
    rideIdSelectedIdx: index('route_stops_ride_id_is_driver_selected_idx').on(
      table.rideId,
      table.isDriverSelected,
    ),
  }),
);
