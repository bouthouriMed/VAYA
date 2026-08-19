import { boolean, doublePrecision, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Configuration for `computeSuggestedPrice` (`@vaya/domain`'s pricing
 * module) — schema per `docs/domain/pricing.md`. Starts with a single
 * `active: true`, `scope: 'national'` row (seeded in `apps/api/src/db/seed.ts`);
 * `scope`/`scopeRefId` exist so pricing can later specialize by region or
 * route without a schema change, but only `national` is used today.
 *
 * `scopeRefId` is deliberately a plain nullable uuid, not a foreign key —
 * it's polymorphic (would reference `routes.id` when scope='route' or a
 * not-yet-existing regions table when scope='region'), and neither case is
 * populated yet, so a real FK constraint would be premature.
 *
 * `platformFeeRate` defaults to 0 — the mechanism exists (per
 * docs/domain/pricing.md's "Platform fee — architecture, not activation")
 * but is not read/applied anywhere in Phase 6; activating it is an explicit
 * future monetization decision (docs/roadmap/README.md Open Decision #3).
 */
export const pricingConfigs = pgTable('pricing_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  scope: varchar('scope', { length: 30 }).notNull().default('national'),
  scopeRefId: uuid('scope_ref_id'),
  baseRatePerKm: doublePrecision('base_rate_per_km').notNull(),
  timeComponentPerMin: doublePrecision('time_component_per_min').notNull(),
  minMultiplier: doublePrecision('min_multiplier').notNull(),
  maxMultiplier: doublePrecision('max_multiplier').notNull(),
  platformFeeRate: doublePrecision('platform_fee_rate').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
