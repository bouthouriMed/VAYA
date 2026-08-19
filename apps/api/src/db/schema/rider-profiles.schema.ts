import { doublePrecision, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

/**
 * Rider-reputation storage — the rider-reputation decision Phase 9
 * (docs/roadmap/phase-09-ratings-trust.md) was required to make. A
 * dedicated table, mirroring `driver_profiles`' aggregate shape, chosen
 * over extending `users` directly. Reasoning (also recorded in
 * docs/domain/model.md):
 *
 *  - Symmetry: `driver_rates_rider` ratings (already modeled in
 *    `ratings.role`) need a write/recompute target exactly like
 *    `rider_rates_driver` ratings do for `driver_profiles` — the same
 *    "recompute from all ratings for that user" aggregation logic
 *    (packages/domain/src/rating/rating-aggregate.ts) now writes to
 *    whichever of the two tables matches the ratee's role in the trip,
 *    with no branching on "is this the users table or a profile table."
 *  - Churn isolation: these are aggregate columns that get rewritten on
 *    every new rating a rider receives. Keeping that churn out of `users`
 *    (the identity source of truth, read on every authenticated request)
 *    avoids growing write-amplification on the one table almost every
 *    request touches.
 *  - Optionality: not every user is ever rated as a rider (many users are
 *    drivers only, or riders who've never completed a trip yet) — a
 *    one-to-one *optional* table models "no rider reputation yet" as "no
 *    row," the same pattern `driver_profiles` already uses for "not a
 *    driver." Extending `users` would mean nullable aggregate columns on
 *    every user row regardless of whether they've ever ridden.
 *
 * Row is created lazily (upserted) on a user's first `driver_rates_rider`
 * rating or first completed trip as a rider — see
 * apps/api/src/modules/ratings/ratings.service.ts and
 * apps/api/src/modules/trips/trips.service.ts.
 */
export const riderProfiles = pgTable('rider_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  ratingAvg: doublePrecision('rating_avg').notNull().default(0),
  tripCount: integer('trip_count').notNull().default(0),
  punctualityScore: doublePrecision('punctuality_score').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
