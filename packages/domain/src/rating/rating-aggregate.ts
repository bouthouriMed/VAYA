/**
 * Rating aggregation (Phase 9 — docs/roadmap/phase-09-ratings-trust.md).
 * Pure logic, no I/O: given the full set of ratings a user has *received*
 * (as driver or as rider — the caller filters by role/rateeUserId first),
 * compute the aggregate scores.
 *
 * Deliberately "recompute from all ratings," not "increment/decrement" —
 * the phase doc's explicit business rule, so this stays correct even if a
 * rating is ever retroactively changed or removed by a future moderation
 * action (out of scope for this phase, but the aggregation shape shouldn't
 * have to change when it lands).
 */

export interface RatingAggregateInput {
  stars: number;
  punctualityFlag: boolean | null;
}

export interface RatingAggregateResult {
  ratingAvg: number;
  punctualityScore: number;
}

/**
 * `punctualityScore` is computed over only the ratings that actually set a
 * punctuality flag (it's an optional field — `packages/validation`'s
 * `createRatingSchema`) — a rater who skipped it shouldn't silently count
 * as "not punctual" and drag the score down.
 */
export function computeRatingAggregate(ratings: RatingAggregateInput[]): RatingAggregateResult {
  if (ratings.length === 0) {
    return { ratingAvg: 0, punctualityScore: 0 };
  }

  const ratingAvg = ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length;

  const flagged = ratings.filter((r) => r.punctualityFlag !== null);
  const punctualCount = flagged.filter((r) => r.punctualityFlag === true).length;
  const punctualityScore = flagged.length === 0 ? 0 : punctualCount / flagged.length;

  return { ratingAvg, punctualityScore };
}
