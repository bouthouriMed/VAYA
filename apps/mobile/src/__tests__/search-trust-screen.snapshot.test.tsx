import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderJSON } from './test-utils/renderJSON';
import type { PublicProfile, TrustSummary } from '../state/api';

/**
 * Real react-test-renderer snapshots of search/trust.tsx (Stitch reference:
 * "Driver Profile", project "Vaya Passenger Journey UX") — renders the
 * actual screen component tree via apps/mobile/vitest.config.ts's mocks,
 * not source-string assertions.
 */

vi.mock('expo-router', () => ({
  router: { back: vi.fn(), push: vi.fn() },
  useLocalSearchParams: () => ({ rideId: 'ride-1', driverUserId: 'user-1' }),
}));

vi.mock('../services/analytics/analytics', () => ({
  trackEvent: vi.fn(),
}));

const fullProfile: PublicProfile = {
  id: 'user-1',
  fullName: 'Mehdi Gharbi',
  avatarUrl: null,
  driver: {
    bio: 'Conducteur ponctuel, trajets Tunis-Nabeul tous les jours.',
    languages: ['Français', 'Arabe'],
    ratingAvg: 4.7,
    tripCount: 128,
    punctualityScore: 0.95,
    reliabilityScore: 0.9,
    vehicle: {
      make: 'Volkswagen',
      model: 'Golf',
      color: 'Gris',
      photoUrl: null,
      plateNumber: '123 TU 4567',
    },
  },
};

const trustSummaryTopRated: TrustSummary = {
  userId: 'user-1',
  driver: { tier: 'top_rated', ratingAvg: 4.7, tripCount: 128, punctualityScore: 0.95 },
  rider: null,
};

function mockApi(profile: PublicProfile | undefined, isProfileLoading: boolean, trustSummary?: TrustSummary): void {
  vi.doMock('../state/api', () => ({
    useGetUserPublicProfileQuery: () => ({ data: profile, isLoading: isProfileLoading }),
    useGetUserTrustSummaryQuery: () => ({ data: trustSummary }),
  }));
}

describe('search/trust.tsx snapshots', () => {
  it('renders a verified driver profile with real stats, pills and vehicle', async () => {
    vi.resetModules();
    mockApi(fullProfile, false, trustSummaryTopRated);
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    expect(tree).toMatchSnapshot();
  });

  it('renders the loading state', async () => {
    vi.resetModules();
    mockApi(undefined, true, undefined);
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    expect(tree).toMatchSnapshot();
  });

  it('renders the "profile not found" state', async () => {
    vi.resetModules();
    mockApi(undefined, false, undefined);
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    expect(tree).toMatchSnapshot();
  });

  it('renders a passenger-only profile (no driver stats/vehicle/pills)', async () => {
    vi.resetModules();
    mockApi({ ...fullProfile, driver: null }, false, { userId: 'user-1', driver: null, rider: null });
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    expect(tree).toMatchSnapshot();
  });
});
