import { boolean, doublePrecision, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Externalized, tunable thresholds for the recurring-pattern detection job
 * (Phase 11 — docs/roadmap/phase-11-recurring-rides.md), mirroring
 * `pricing_configs`' exact shape/role (Phase 6): a single active row read
 * by `recurring-config.service.ts` and mapped onto `@vaya/domain`'s pure
 * `RecurringDetectionConfig` input, with `DEFAULT_RECURRING_DETECTION_CONFIG`
 * as the in-package fallback if no row exists. See that type's doc comment
 * (`packages/domain/src/recurring/recurring-detection-config.types.ts`) for
 * what each column controls.
 *
 * `scope` mirrors `pricing_configs.scope` — schema room for a future
 * per-region/route specialization, only `'global'` populated today.
 */
export const recurringDetectionConfigs = pgTable('recurring_detection_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  scope: varchar('scope', { length: 30 }).notNull().default('global'),
  minTripCount: integer('min_trip_count').notNull(),
  fullConfidenceTripCount: integer('full_confidence_trip_count').notNull(),
  lookbackDays: integer('lookback_days').notNull(),
  corridorRadiusMeters: doublePrecision('corridor_radius_meters').notNull(),
  timeWindowMinutes: doublePrecision('time_window_minutes').notNull(),
  suggestedConfidenceThreshold: doublePrecision('suggested_confidence_threshold').notNull(),
  dismissalRequiredConfidenceDelta: doublePrecision('dismissal_required_confidence_delta').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
