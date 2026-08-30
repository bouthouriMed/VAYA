import { boolean, doublePrecision, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * VAYA Operational Policy Configuration (docs/unified_driver_and_passenger_journey.md
 * §28) — every matching/lifecycle/timing threshold this codebase's domain
 * layer treats as "a first-cut default, not a settled product number."
 * Mirrors `pricing_configs`' exact single-active-row-per-scope pattern
 * (same `scope`/`active` shape, same `national`-only-for-now posture) —
 * extending that established pattern per CLAUDE.md's "extend, don't
 * duplicate" rule, rather than inventing a second configuration mechanism.
 *
 * Every column here has a corresponding pure default already shipped in
 * `packages/domain` (existing-passenger-impact-thresholds.ts,
 * cancellation-policy.ts, live-corridor.ts, request-deadline.ts,
 * journey-grouping.ts, matching-thresholds.ts's MAX_DETOUR_RATIO) — this
 * table's row, when active, OVERRIDES those defaults; when no active row
 * exists, every consuming service falls back to the pure default
 * unchanged (never blocks the request the config gap was found on, same
 * discipline `getActivePricingConfig` already established).
 */
export const operationalConfigs = pgTable('operational_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  scope: varchar('scope', { length: 30 }).notNull().default('national'),

  // Matching (matching-thresholds.ts's MAX_DETOUR_RATIO).
  maxDetourRatio: doublePrecision('max_detour_ratio'),

  // Existing-passenger soft protection (§27, existing-passenger-impact-thresholds.ts).
  existingPassengerMaxDelayRatio: doublePrecision('existing_passenger_max_delay_ratio'),
  existingPassengerMaxAbsoluteDelayMinutes: doublePrecision('existing_passenger_max_absolute_delay_minutes'),

  // Cancellation tiers (§36/§38, cancellation-policy.ts).
  cancellationFreeWindowHours: doublePrecision('cancellation_free_window_hours'),
  cancellationModerateWindowMinutes: doublePrecision('cancellation_moderate_window_minutes'),

  // No-show (§37, cancellation-policy.ts).
  noShowMinMinutesAfterDeparture: doublePrecision('no_show_min_minutes_after_departure'),
  noShowMaxReporterDistanceMeters: doublePrecision('no_show_max_reporter_distance_meters'),

  // Route deviation / live corridor (§29/§51, live-corridor.ts).
  routeDeviationNoiseThresholdMeters: doublePrecision('route_deviation_noise_threshold_meters'),
  routeDeviationRealThresholdMeters: doublePrecision('route_deviation_real_threshold_meters'),

  // Request response deadline (§20, request-deadline.ts).
  bookingResponseWindowMinutes: doublePrecision('booking_response_window_minutes'),

  // "Same journey" request grouping (§20, journey-grouping.ts).
  sameJourneyPickupRadiusMeters: doublePrecision('same_journey_pickup_radius_meters'),
  sameJourneyDropoffRadiusMeters: doublePrecision('same_journey_dropoff_radius_meters'),
  sameJourneyTimeWindowMinutes: doublePrecision('same_journey_time_window_minutes'),
  maxActiveRequestsPerJourney: integer('max_active_requests_per_journey'),

  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
