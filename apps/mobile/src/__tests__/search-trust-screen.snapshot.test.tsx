import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderJSON } from './test-utils/renderJSON';
import type { PublicProfile, TrustSummary, Conversation } from '../state/api';

/**
 * Real react-test-renderer snapshots of search/trust.tsx (Stitch reference:
 * "Driver Profile", project "Vaya Passenger Journey UX") — renders the
 * actual screen component tree via apps/mobile/vitest.config.ts's mocks,
 * not source-string assertions.
 */

let searchParams: { rideId: string; driverUserId: string; bookingId?: string } = {
  rideId: 'ride-1',
  driverUserId: 'user-1',
};

vi.mock('expo-router', () => ({
  router: { back: vi.fn(), push: vi.fn() },
  useLocalSearchParams: () => searchParams,
}));

vi.mock('../services/analytics/analytics', () => ({
  trackEvent: vi.fn(),
}));

const fullProfile: PublicProfile = {
  id: 'user-1',
  fullName: 'Mehdi Gharbi',
  avatarUrl: null,
  memberSince: '2025-03-14T10:00:00Z',
  driver: {
    verified: true,
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
  driver: { tier: 'top_rated', ratingAvg: 4.7, tripCount: 128, punctualityScore: 0.95, ratingCount: 96, starCounts: [1, 1, 4, 16, 74], punctualityRatingCount: 80 },
  rider: null,
};

const acceptedConversation: Conversation = {
  id: 'conv-1',
  bookingId: 'booking-1',
  status: 'open',
  createdAt: '2026-08-24T09:05:00Z',
  updatedAt: '2026-08-24T09:05:00Z',
  viewerRole: 'driver',
  otherParty: { id: 'user-1', fullName: 'Mehdi Gharbi', avatarUrl: null },
  otherPartyRole: 'rider',
  isOtherPartyVerified: false,
  rideId: 'ride-1',
  originLabel: 'Tunis',
  destinationLabel: 'Nabeul',
  pickupLabel: 'Tunis',
  dropoffLabel: 'Nabeul',
  departureAt: '2026-08-25T08:00:00Z',
  rideStatus: 'published',
  tripStatus: null,
  lastMessage: null,
  hasUnread: false,
};

function mockApi(
  profile: PublicProfile | undefined,
  isProfileLoading: boolean,
  trustSummary?: TrustSummary,
  conversation?: Conversation,
): void {
  vi.doMock('../state/api', () => ({
    useGetUserPublicProfileQuery: () => ({ data: profile, isLoading: isProfileLoading }),
    useGetUserTrustSummaryQuery: () => ({ data: trustSummary }),
    useGetConversationByBookingQuery: () => ({ data: conversation }),
  }));
}

describe('search/trust.tsx snapshots', () => {
  it('renders a verified driver profile with real stats, pills and vehicle', async () => {
    vi.resetModules();
    searchParams = { rideId: 'ride-1', driverUserId: 'user-1' };
    mockApi(fullProfile, false, trustSummaryTopRated);
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    expect(tree).toMatchSnapshot();
  });

  it('renders the loading state', async () => {
    vi.resetModules();
    searchParams = { rideId: 'ride-1', driverUserId: 'user-1' };
    mockApi(undefined, true, undefined);
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    expect(tree).toMatchSnapshot();
  });

  it('renders the "profile not found" state', async () => {
    vi.resetModules();
    searchParams = { rideId: 'ride-1', driverUserId: 'user-1' };
    mockApi(undefined, false, undefined);
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    expect(tree).toMatchSnapshot();
  });

  it('renders a brand-new passenger profile (no rider trust data yet)', async () => {
    vi.resetModules();
    searchParams = { rideId: 'ride-1', driverUserId: 'user-1' };
    mockApi({ ...fullProfile, driver: null }, false, { userId: 'user-1', driver: null, rider: null });
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    expect(tree).toMatchSnapshot();
  });

  it('renders a passenger profile with real rider trust stats', async () => {
    vi.resetModules();
    searchParams = { rideId: 'ride-1', driverUserId: 'user-1', bookingId: 'booking-1' };
    mockApi({ ...fullProfile, driver: null }, false, {
      userId: 'user-1',
      driver: null,
      rider: { tier: 'trusted', ratingAvg: 4.3, tripCount: 9, punctualityScore: 0.9, ratingCount: 7, starCounts: [0, 0, 1, 3, 3], punctualityRatingCount: 5 },
    });
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    expect(tree).toMatchSnapshot();
  });

  it('enables a real Message button once a conversation exists for the booking', async () => {
    vi.resetModules();
    searchParams = { rideId: 'ride-1', driverUserId: 'user-1', bookingId: 'booking-1' };
    mockApi(
      { ...fullProfile, driver: null },
      false,
      { userId: 'user-1', driver: null, rider: null },
      acceptedConversation,
    );
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    expect(tree).toMatchSnapshot();
  });
  it('renders a brand-new verified driver: welcome and VAYA checks instead of empty numbers', async () => {
    vi.resetModules();
    searchParams = { rideId: 'ride-1', driverUserId: 'user-1' };
    mockApi(
      { ...fullProfile, driver: { ...fullProfile.driver!, ratingAvg: 0, tripCount: 0, punctualityScore: 0, reliabilityScore: 0, bio: null } },
      false,
      {
        userId: 'user-1',
        driver: { tier: 'new', ratingAvg: 0, tripCount: 0, punctualityScore: 0, ratingCount: 0, starCounts: [0, 0, 0, 0, 0], punctualityRatingCount: 0 },
        rider: null,
      },
    );
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    const text = JSON.stringify(tree);
    expect(text).toContain('search:trust.welcomeTitle');
    expect(text).toContain('search:trust.verifiedByVaya');
    expect(text).not.toContain('search:trust.reviewsTitle');
    expect(text).not.toContain('—');
    expect(tree).toMatchSnapshot();
  });

  it('renders a driver with trips but no review yet without a placeholder rating', async () => {
    vi.resetModules();
    searchParams = { rideId: 'ride-1', driverUserId: 'user-1' };
    mockApi(
      { ...fullProfile, driver: { ...fullProfile.driver!, ratingAvg: 0, tripCount: 1, punctualityScore: 0, reliabilityScore: 0 } },
      false,
      {
        userId: 'user-1',
        driver: { tier: 'new', ratingAvg: 0, tripCount: 1, punctualityScore: 0, ratingCount: 0, starCounts: [0, 0, 0, 0, 0], punctualityRatingCount: 0 },
        rider: null,
      },
    );
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    const text = JSON.stringify(tree);
    expect(text).not.toContain('—');
    expect(text).toContain('search:trust.reviewsEmpty');
    expect(text).not.toContain('search:trust.welcomeTitle');
    expect(tree).toMatchSnapshot();
  });

  it('never shows "Vérifié" for a driver whose documents are still under review', async () => {
    vi.resetModules();
    searchParams = { rideId: 'ride-1', driverUserId: 'user-1' };
    mockApi(
      { ...fullProfile, driver: { ...fullProfile.driver!, verified: false, tripCount: 0, ratingAvg: 0 } },
      false,
      { userId: 'user-1', driver: null, rider: null },
    );
    const { default: TrustScreen } = await import('../../app/search/trust');
    const tree = renderJSON(<TrustScreen />);
    const text = JSON.stringify(tree);
    expect(text).not.toContain('search:trust.verifiedByVaya');
    expect(text).not.toContain('search:trust.verifiedA11y');
    expect(text).toContain('search:trust.verificationPending');
    expect(text).not.toContain('search:trust.welcomeBodyDriver');
  });
});
