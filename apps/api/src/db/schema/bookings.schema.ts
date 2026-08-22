import {
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { rides } from './rides.schema';
import { routeStops } from './route-stops.schema';
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

export const bookings = pgTable(
  'bookings',
  {
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
    // Ride-engine passenger selection (docs/domain/ride-engine.md): the
    // driver-selected route_stop this booking's pickup was chosen from,
    // when the ride has any. Nullable and additive — `set null` on delete
    // rather than cascade, since stop-candidates.service.ts's
    // regeneration path deletes and reinserts route_stops when a route
    // changes, and a booking must never be destroyed by that. pickupLabel/
    // Lat/Lng below are still populated (copied from the stop at booking
    // time) so existing consumers never need to branch on whether this is
    // set — see the Rollout note in docs/domain/ride-engine.md.
    pickupStopId: uuid('pickup_stop_id').references(() => routeStops.id, { onDelete: 'set null' }),
    pickupLabel: varchar('pickup_label', { length: 140 }).notNull(),
    pickupLat: doublePrecision('pickup_lat').notNull(),
    pickupLng: doublePrecision('pickup_lng').notNull(),
    // Phase 13 (docs/roadmap/phase-13-search-engine.md): dropoff-side mirror
    // of pickupStopId above, needed once matching can find a ride whose own
    // destination isn't the rider's actual destination (route-passthrough
    // matches). Nullable, unlike the pickup columns — most bookings never
    // set this and simply drop the rider at the ride's own destinationLabel/
    // Lat/Lng, exactly as every booking behaved before this column existed.
    // `set null` on delete for the same reason as pickupStopId: stop
    // regeneration must never destroy a booking.
    dropoffStopId: uuid('dropoff_stop_id').references(() => routeStops.id, { onDelete: 'set null' }),
    dropoffLabel: varchar('dropoff_label', { length: 140 }),
    dropoffLat: doublePrecision('dropoff_lat'),
    dropoffLng: doublePrecision('dropoff_lng'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    rideIdIdx: index('bookings_ride_id_idx').on(table.rideId),
    riderIdIdx: index('bookings_rider_id_idx').on(table.riderId),
    pickupStopIdIdx: index('bookings_pickup_stop_id_idx').on(table.pickupStopId),
    dropoffStopIdIdx: index('bookings_dropoff_stop_id_idx').on(table.dropoffStopId),
  }),
);
