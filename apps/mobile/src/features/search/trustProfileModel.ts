import type { PublicProfile, TrustSummary, TrustTier } from '../../state/api';

/** At or above this rating-derived reliabilityScore a driver gets the
 *  "Fiable" mark. Below it they aren't unreliable — the screen just
 *  doesn't vouch for them as a highlight. */
export const RELIABLE_THRESHOLD = 0.85;

/** The headline numbers, in display order. */
export type TrustStat = 'rating' | 'trips' | 'punctuality' | 'tenure';

export interface TrustProfileModel {
  kind: 'driver' | 'rider';
  /** Admin-approved driver — the only case shown as "Vérifié". */
  verified: boolean;
  /** A driver profile whose documents are still being reviewed. */
  verificationPending: boolean;
  tier: TrustTier | null;
  reliable: boolean;
  /** No completed trip yet in the role being viewed. */
  isNew: boolean;
  tripCount: number;
  ratingAvg: number;
  ratingCount: number;
  starCounts: [number, number, number, number, number];
  /** 0..1, or null when no rating answered the punctuality question —
   *  a score of 0 would otherwise read as "always late". */
  punctuality: number | null;
  /** Empty for a new profile: a welcome replaces the numbers. */
  stats: TrustStat[];
  /** Tenure is shown exactly once — in the stats when there's room for
   *  it, otherwise under the name. */
  tenureInHeader: boolean;
  reviews: 'breakdown' | 'empty' | 'none';
}

const NO_STARS: [number, number, number, number, number] = [0, 0, 0, 0, 0];

/**
 * What the profile screen shows, decided once from real data. Every
 * section is driven by a fact the API returned — a number that doesn't
 * exist yet (no ratings, no punctuality answers) is left out rather than
 * shown as "—" or 0.
 */
export function buildTrustProfileModel(profile: PublicProfile, summary: TrustSummary | undefined): TrustProfileModel {
  const driver = profile.driver;
  const kind = driver ? 'driver' : 'rider';
  const aggregate = driver ? summary?.driver : summary?.rider;

  const tripCount = driver ? driver.tripCount : (aggregate?.tripCount ?? 0);
  const ratingAvg = driver ? driver.ratingAvg : (aggregate?.ratingAvg ?? 0);
  const ratingCount = aggregate?.ratingCount ?? 0;
  const punctuality =
    aggregate && aggregate.punctualityRatingCount > 0 ? aggregate.punctualityScore : null;
  const isNew = tripCount === 0;

  const stats: TrustStat[] = [];
  if (!isNew) {
    if (ratingCount > 0) stats.push('rating');
    stats.push('trips');
    if (punctuality !== null) stats.push('punctuality');
    if (stats.length < 3) stats.push('tenure');
  }

  return {
    kind,
    verified: driver?.verified ?? false,
    verificationPending: driver ? !driver.verified : false,
    tier: aggregate?.tier ?? (isNew ? 'new' : null),
    reliable: Boolean(driver && ratingCount > 0 && driver.reliabilityScore >= RELIABLE_THRESHOLD),
    isNew,
    tripCount,
    ratingAvg,
    ratingCount,
    starCounts: aggregate?.starCounts ?? NO_STARS,
    punctuality,
    stats,
    tenureInHeader: !stats.includes('tenure'),
    reviews: ratingCount > 0 ? 'breakdown' : isNew ? 'none' : 'empty',
  };
}
