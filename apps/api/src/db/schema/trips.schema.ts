import { doublePrecision, index, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bookings } from './bookings.schema';
import { rides } from './rides.schema';

export const tripStatusEnum = pgEnum('trip_status', [
  'scheduled',
  'driver_approaching',
  'pickup',
  'active',
  'arriving',
  'completed',
  'no_show',
  'cancelled',
]);

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    status: tripStatusEnum('status').notNull().default('scheduled'),
    simulationStartedAt: timestamp('simulation_started_at', { withTimezone: true }),
    pickupConfirmedAt: timestamp('pickup_confirmed_at', { withTimezone: true }),
    dropoffAt: timestamp('dropoff_at', { withTimezone: true }),
    // Phase 9 (docs/roadmap/phase-09-ratings-trust.md): set the moment a
    // trip reaches `completed` (apps/api/src/modules/trips's completeTrip)
    // — the anchor for the 24h rating-submission window
    // (packages/domain/src/rating/rating-window.ts). Nullable/additive per
    // CLAUDE.md's "trips schema — additive changes only" rule; null for
    // every trip that isn't completed (or completed before this column
    // existed).
    completedAt: timestamp('completed_at', { withTimezone: true }),
    riderSettlementConfirmedAt: timestamp('rider_settlement_confirmed_at', { withTimezone: true }),
    driverSettlementConfirmedAt: timestamp('driver_settlement_confirmed_at', {
      withTimezone: true,
    }),
    // Live tracking (docs/domain/live-tracking.md): the journey's real start,
    // distinct from `createdAt` (row creation, at booking-acceptance time).
    // Set once by POST /trips/:id/start.
    startedAt: timestamp('started_at', { withTimezone: true }),
    // Deliberately *not* a location-history table — CLAUDE.md's live-tracking
    // brief explicitly calls for minimizing GPS retention. Only the driver's
    // latest reported fix is ever stored; every prior fix is overwritten
    // in place by POST /trips/:id/location. Nullable: never set until the
    // driver's device has produced a first fix after `start`.
    currentLat: doublePrecision('current_lat'),
    currentLng: doublePrecision('current_lng'),
    currentHeadingDeg: doublePrecision('current_heading_deg'),
    currentSpeedMps: doublePrecision('current_speed_mps'),
    currentAccuracyM: doublePrecision('current_accuracy_m'),
    locationUpdatedAt: timestamp('location_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ rideIdIdx: index('trips_ride_id_idx').on(table.rideId) }),
);
