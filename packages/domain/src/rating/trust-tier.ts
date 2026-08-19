/**
 * Trust-tier computation (Phase 9 — docs/roadmap/phase-09-ratings-trust.md).
 * Pure logic, no I/O — mirrors the rest of packages/domain's
 * state-machine-style modules (trip-status.ts, booking-status.ts).
 *
 * VAYA's own three-tier naming (not a copy of BlaBlaCar's Expert/Ambassador
 * labels, per the phase doc's explicit instruction): "New" / "Trusted" /
 * "Top-rated". Applies identically to a driver's or a rider's aggregate —
 * the same three inputs (trip count, rating average, account age) describe
 * either direction of the marketplace's trust relationship.
 */

export const TRUST_TIERS = ['new', 'trusted', 'top_rated'] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

/** VAYA-branded, French-first labels for display — swap/localize at the UI layer if needed. */
export const TRUST_TIER_LABELS: Record<TrustTier, string> = {
  new: 'Nouveau',
  trusted: 'Confiance',
  top_rated: 'Top VAYA',
};

/**
 * Below this trip count there simply isn't enough signal to call someone
 * "Trusted" yet, regardless of how their handful of early ratings look —
 * a single 5-star rating from one trip shouldn't outrank someone with a
 * long, consistent history. Tenure-gated, not rating-gated.
 */
export const NEW_TIER_MAX_TRIP_COUNT = 4;

/** Top-rated requires meaningful trip volume, a strong sustained rating, and tenure — all three, not any one. */
export const TOP_TIER_MIN_TRIP_COUNT = 20;
export const TOP_TIER_MIN_RATING_AVG = 4.7;
export const TOP_TIER_MIN_ACCOUNT_AGE_DAYS = 60;

export interface TrustTierInput {
  tripCount: number;
  ratingAvg: number;
  /** Age of the underlying user account, in days — `users.createdAt` to now. */
  accountAgeDays: number;
}

/**
 * `tripCount`/`ratingAvg` come from the appropriate aggregate row
 * (`driver_profiles` or `rider_profiles`); `accountAgeDays` is derived from
 * `users.createdAt` by the caller. All three thresholds must independently
 * hold for "Top VAYA" — falling short of any one of them (not enough trips,
 * not enough tenure, or a rating that dipped) lands a user back in
 * "Confiance" rather than losing trust-signal visibility entirely.
 */
export function computeTrustTier(input: TrustTierInput): TrustTier {
  const { tripCount, ratingAvg, accountAgeDays } = input;

  if (tripCount <= NEW_TIER_MAX_TRIP_COUNT) {
    return 'new';
  }

  if (
    tripCount >= TOP_TIER_MIN_TRIP_COUNT &&
    ratingAvg >= TOP_TIER_MIN_RATING_AVG &&
    accountAgeDays >= TOP_TIER_MIN_ACCOUNT_AGE_DAYS
  ) {
    return 'top_rated';
  }

  return 'trusted';
}
