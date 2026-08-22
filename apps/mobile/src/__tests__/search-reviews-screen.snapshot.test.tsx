import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderJSON } from './test-utils/renderJSON';
import type { PublicProfile } from '../state/api';

/**
 * Real react-test-renderer snapshots of search/reviews.tsx (Stitch
 * reference: "Driver Reviews", project "Vaya Passenger Journey UX").
 */

vi.mock('expo-router', () => ({
  router: { back: vi.fn(), push: vi.fn() },
  useLocalSearchParams: () => ({ driverUserId: 'user-1', driverName: 'Mehdi Gharbi' }),
}));

const profileWithDriver: PublicProfile = {
  id: 'user-1',
  fullName: 'Mehdi Gharbi',
  avatarUrl: null,
  driver: {
    bio: null,
    languages: null,
    ratingAvg: 4.7,
    tripCount: 128,
    punctualityScore: 0.95,
    reliabilityScore: 0.9,
    vehicle: null,
  },
};

function mockApi(profile: PublicProfile | undefined): void {
  vi.doMock('../state/api', () => ({
    useGetUserPublicProfileQuery: () => ({ data: profile }),
  }));
}

describe('search/reviews.tsx snapshots', () => {
  it('renders the mock review list under a real driver identity/rating', async () => {
    vi.resetModules();
    mockApi(profileWithDriver);
    const { default: DriverReviewsScreen } = await import('../../app/search/reviews');
    const tree = renderJSON(<DriverReviewsScreen />);
    expect(tree).toMatchSnapshot();
  });

  it('renders before the profile has loaded (icon placeholder, no rating row)', async () => {
    vi.resetModules();
    mockApi(undefined);
    const { default: DriverReviewsScreen } = await import('../../app/search/reviews');
    const tree = renderJSON(<DriverReviewsScreen />);
    expect(tree).toMatchSnapshot();
  });
});
