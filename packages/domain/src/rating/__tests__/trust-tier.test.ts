import { describe, it, expect } from 'vitest';
import {
  computeTrustTier,
  NEW_TIER_MAX_TRIP_COUNT,
  TOP_TIER_MIN_TRIP_COUNT,
  TOP_TIER_MIN_RATING_AVG,
  TOP_TIER_MIN_ACCOUNT_AGE_DAYS,
} from '../trust-tier';

describe('computeTrustTier', () => {
  it('is "new" for a brand-new user with no trips', () => {
    expect(computeTrustTier({ tripCount: 0, ratingAvg: 0, accountAgeDays: 0 })).toBe('new');
  });

  it('is "new" up to and including the max new-tier trip count, regardless of rating/tenure', () => {
    expect(
      computeTrustTier({
        tripCount: NEW_TIER_MAX_TRIP_COUNT,
        ratingAvg: 5,
        accountAgeDays: 1000,
      }),
    ).toBe('new');
  });

  it('is "trusted" once trip count clears the new-tier ceiling but top-tier bar is unmet', () => {
    expect(
      computeTrustTier({
        tripCount: NEW_TIER_MAX_TRIP_COUNT + 1,
        ratingAvg: 3.5,
        accountAgeDays: 10,
      }),
    ).toBe('trusted');
  });

  it('is "top_rated" only once trip count, rating, and tenure all clear their thresholds', () => {
    expect(
      computeTrustTier({
        tripCount: TOP_TIER_MIN_TRIP_COUNT,
        ratingAvg: TOP_TIER_MIN_RATING_AVG,
        accountAgeDays: TOP_TIER_MIN_ACCOUNT_AGE_DAYS,
      }),
    ).toBe('top_rated');
  });

  it('is "trusted" (not "top_rated") when trip count is one below the top threshold', () => {
    expect(
      computeTrustTier({
        tripCount: TOP_TIER_MIN_TRIP_COUNT - 1,
        ratingAvg: 4.9,
        accountAgeDays: 200,
      }),
    ).toBe('trusted');
  });

  it('is "trusted" (not "top_rated") when rating is just below the top threshold', () => {
    expect(
      computeTrustTier({
        tripCount: 50,
        ratingAvg: TOP_TIER_MIN_RATING_AVG - 0.1,
        accountAgeDays: 200,
      }),
    ).toBe('trusted');
  });

  it('is "trusted" (not "top_rated") when tenure is just below the top threshold', () => {
    expect(
      computeTrustTier({
        tripCount: 50,
        ratingAvg: 4.9,
        accountAgeDays: TOP_TIER_MIN_ACCOUNT_AGE_DAYS - 1,
      }),
    ).toBe('trusted');
  });

  it('stays "trusted" for a high trip count with a mediocre rating (no separate low tier in this phase)', () => {
    expect(
      computeTrustTier({ tripCount: 100, ratingAvg: 2.9, accountAgeDays: 400 }),
    ).toBe('trusted');
  });
});
