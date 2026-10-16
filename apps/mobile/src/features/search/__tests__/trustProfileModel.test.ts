import { describe, it, expect } from 'vitest';
import { buildTrustProfileModel } from '../trustProfileModel';
import type { PublicProfile, TierAggregate, TrustSummary } from '../../../state/api';

const baseDriver: NonNullable<PublicProfile['driver']> = {
  verified: true,
  bio: null,
  languages: null,
  ratingAvg: 0,
  tripCount: 0,
  punctualityScore: 0,
  reliabilityScore: 0,
  vehicle: null,
};

function profile(driver: Partial<NonNullable<PublicProfile['driver']>> | null): PublicProfile {
  return {
    id: 'u1',
    fullName: 'Dinara K',
    avatarUrl: null,
    memberSince: '2026-03-01T00:00:00Z',
    driver: driver ? { ...baseDriver, ...driver } : null,
  };
}

function aggregate(over: Partial<TierAggregate>): TierAggregate {
  return {
    tier: 'new',
    ratingAvg: 0,
    tripCount: 0,
    punctualityScore: 0,
    ratingCount: 0,
    starCounts: [0, 0, 0, 0, 0],
    punctualityRatingCount: 0,
    ...over,
  };
}

function summary(role: 'driver' | 'rider', agg: TierAggregate | null): TrustSummary {
  return { userId: 'u1', driver: role === 'driver' ? agg : null, rider: role === 'rider' ? agg : null };
}

describe('buildTrustProfileModel', () => {
  it('new verified driver: no numbers, a welcome, no reviews section', () => {
    const m = buildTrustProfileModel(profile({}), summary('driver', aggregate({})));
    expect(m).toMatchObject({ kind: 'driver', verified: true, isNew: true, stats: [], tenureInHeader: true, reviews: 'none', tier: 'new' });
  });

  it('driver with trips but no rating: trips + tenure, never a placeholder rating', () => {
    const m = buildTrustProfileModel(
      profile({ tripCount: 1 }),
      summary('driver', aggregate({ tripCount: 1 })),
    );
    expect(m.stats).toEqual(['trips', 'tenure']);
    expect(m.tenureInHeader).toBe(false);
    expect(m.reviews).toBe('empty');
  });

  it('rated driver: rating, trips, punctuality; tenure moves to the header', () => {
    const m = buildTrustProfileModel(
      profile({ tripCount: 40, ratingAvg: 4.8, reliabilityScore: 0.9 }),
      summary(
        'driver',
        aggregate({ tier: 'top_rated', tripCount: 40, ratingAvg: 4.8, ratingCount: 31, starCounts: [0, 0, 1, 4, 26], punctualityRatingCount: 20, punctualityScore: 0.95 }),
      ),
    );
    expect(m.stats).toEqual(['rating', 'trips', 'punctuality']);
    expect(m.tenureInHeader).toBe(true);
    expect(m.reviews).toBe('breakdown');
    expect(m.punctuality).toBe(0.95);
    expect(m.reliable).toBe(true);
  });

  it('a punctuality score of 0 with no answers is no signal, not "always late"', () => {
    const m = buildTrustProfileModel(
      profile({ tripCount: 3, ratingAvg: 5 }),
      summary('driver', aggregate({ tripCount: 3, ratingAvg: 5, ratingCount: 2, starCounts: [0, 0, 0, 0, 2] })),
    );
    expect(m.punctuality).toBeNull();
    expect(m.stats).toEqual(['rating', 'trips', 'tenure']);
  });

  it('never marks a driver under review as verified, or as reliable without ratings', () => {
    const m = buildTrustProfileModel(profile({ verified: false, reliabilityScore: 1 }), undefined);
    expect(m.verified).toBe(false);
    expect(m.verificationPending).toBe(true);
    expect(m.reliable).toBe(false);
  });

  it('passenger: uses the rider aggregate, no driver-only facts', () => {
    const m = buildTrustProfileModel(
      profile(null),
      summary('rider', aggregate({ tier: 'trusted', tripCount: 9, ratingAvg: 4.3, ratingCount: 7, starCounts: [0, 0, 1, 3, 3] })),
    );
    expect(m).toMatchObject({ kind: 'rider', verified: false, verificationPending: false, tripCount: 9, reviews: 'breakdown' });
  });

  it('passenger with no rider history yet is a new passenger', () => {
    const m = buildTrustProfileModel(profile(null), summary('rider', null));
    expect(m).toMatchObject({ kind: 'rider', isNew: true, stats: [], reviews: 'none' });
  });
});
