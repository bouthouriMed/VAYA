import { doublePrecision, index, integer, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
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
    // Trip-staleness sweep (packages/domain/src/trip/trip-staleness.ts,
    // apps/api/src/modules/trips/trip-staleness-sweep.worker.ts) — set the
    // first time the periodic sweep sends the "did your trip end?" reminder,
    // so a still-abandoned trip doesn't get re-notified on every sweep
    // cycle. Never cleared: a manual/GPS completion makes the trip terminal
    // anyway, and a resubmission scenario doesn't exist for trips.
    completionReminderSentAt: timestamp('completion_reminder_sent_at', { withTimezone: true }),
    // Journey-contract second pass (docs/unified_driver_and_passenger_journey.md
    // §29/§51, M-090, EDGE-051, INV-08): "Planned route" (as published) and
    // "live feasible corridor" (current reality) are distinct concepts —
    // the planned route itself lives entirely on `rides.routePolyline` and
    // is NEVER touched here (INV-08). These two columns are the *live*
    // half only: the latest noise/real_deviation classification and a
    // simplified live-corridor waypoint pair
    // (@vaya/domain's `classifyRouteDeviation`/`updateLiveCorridor`) —
    // null until the first location update on a trip with real route data.
    routeDeviationStatus: varchar('route_deviation_status', { length: 20 }),
    liveCorridorWaypoints: jsonb('live_corridor_waypoints'),
    // M-104 (spec §37, "VAYA may also automatically classify a no-show when
    // evidence is sufficiently strong"): the ONE bit of pre-start location
    // history this table keeps, deliberately — not a location-history table
    // (this trips schema's own stated brief above stays true), just a single
    // "was the driver ever genuinely near the ride's origin" flag, set once
    // and never cleared, by trips.service.ts's updateTripLocation. Without
    // it, a 'scheduled' trip whose only stored location is its latest fix
    // can never distinguish "driver never came near" from "driver was here
    // earlier and has since moved on toward the destination" — exactly the
    // asymmetry evaluateAutoNoShowClassification's driver-no-show branch
    // needs to stay conservative instead of guessing.
    driverEverNearOriginAt: timestamp('driver_ever_near_origin_at', { withTimezone: true }),
    // Set the moment an automatic (no human report) no-show classification
    // fires — distinguishes an auto-classified no_show from a human-reported
    // one on the same terminal booking/trip status, for observability/
    // support tooling. Never set by the manual reportNoShow path.
    autoNoShowClassifiedAt: timestamp('auto_no_show_classified_at', { withTimezone: true }),
    // M-113 (spec §39, "route/ETA changed" — the ETA-only half): the last
    // live-recomputed ETA a rider was actually notified about
    // (updateTripLocation dispatches 'trip_eta_changed' only when a fresh
    // recompute differs from this by more than ETA_CHANGE_NOTIFY_THRESHOLD_SEC,
    // then updates it) — never on every ~20s recompute, only a genuinely
    // meaningful change. Null until the first live ETA has ever been
    // computed for this trip.
    lastNotifiedEtaSec: integer('last_notified_eta_sec'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ rideIdIdx: index('trips_ride_id_idx').on(table.rideId) }),
);
