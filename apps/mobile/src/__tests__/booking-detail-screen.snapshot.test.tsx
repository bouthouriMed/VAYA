import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderJSON } from './test-utils/renderJSON';
import type { RootState } from '../state/store';
import type { Booking, PublicProfile, TrustSummary } from '../state/api';

/**
 * Real react-test-renderer snapshots of bookings/[bookingId].tsx (2026-08-23
 * trips/notifications redesign) — the passenger's own trip hub, reusing
 * search/ride-details.tsx's visual language (map header, driver card,
 * timeline) but for viewing an *existing* booking: real driver public
 * profile resolved from booking.ride.driverUserId, a sticky "Annuler ma
 * réservation" footer instead of "Demander une place".
 */

vi.mock('expo-router', () => ({
  router: { back: vi.fn(), replace: vi.fn(), push: vi.fn(), canGoBack: vi.fn(() => false) },
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));

vi.mock('../state/store', () => ({
  useAppSelector: (selector: (s: Pick<RootState, 'auth'>) => unknown) =>
    selector({ auth: { accessToken: 'test-token' } } as Pick<RootState, 'auth'>),
}));

const ACCEPTED_BOOKING: Booking = {
  id: 'booking-1',
  rideId: 'ride-1',
  riderId: 'u-me',
  seatsRequested: 2,
  contributionTotal: 21,
  status: 'accepted',
  pickupStopId: null,
  pickupLabel: 'Arrêt Menzah 6',
  pickupLat: 36.842,
  pickupLng: 10.18,
  dropoffStopId: null,
  dropoffLabel: null,
  dropoffLat: null,
  dropoffLng: null,
  requestedAt: '2026-08-22T08:00:00',
  respondedAt: '2026-08-22T08:30:00',
  ride: {
    originLabel: 'Tunis',
    destinationLabel: 'Hammamet',
    departureAt: '2026-08-25T08:30:00',
    contributionPerSeat: 10.5,
    driverFullName: 'Amine Ben Salah',
    driverUserId: 'driver-amine',
    status: 'published',
  },
};

const DRIVER_PROFILE: PublicProfile = {
  id: 'driver-amine',
  fullName: 'Amine Ben Salah',
  avatarUrl: null,
  driver: {
    bio: 'Trajets réguliers Tunis-Hammamet.',
    languages: ['Français', 'Arabe'],
    ratingAvg: 4.85,
    tripCount: 130,
    punctualityScore: 0.93,
    reliabilityScore: 0.94,
    vehicle: {
      make: 'Peugeot',
      model: '301',
      color: 'Noire',
      photoUrl: null,
      plateNumber: '210TU3344',
    },
  },
};

const TRUST_SUMMARY: TrustSummary = {
  userId: 'driver-amine',
  driver: { tier: 'trusted', ratingAvg: 4.85, tripCount: 130, punctualityScore: 0.93 },
  rider: null,
};

type QueryResult<T> = { data?: T; isLoading?: boolean };
type MutationTuple = [unknown, { isLoading: boolean }];

function mockApi(): void {
  vi.doMock('../state/api', () => ({
    useListMyBookingsQuery: (): QueryResult<Booking[]> => ({ data: [ACCEPTED_BOOKING] }),
    useGetRideQuery: (): QueryResult<unknown> => ({
      data: {
        id: 'ride-1',
        originLat: 36.8065,
        originLng: 10.1815,
        destinationLat: 36.4,
        destinationLng: 10.6,
        routePolyline: null,
      },
    }),
    useGetUserPublicProfileQuery: (): QueryResult<PublicProfile> => ({ data: DRIVER_PROFILE }),
    useGetUserTrustSummaryQuery: (): QueryResult<TrustSummary> => ({ data: TRUST_SUMMARY }),
    // CancellationSheet's transitive hooks — rendered closed (visible=false)
    // so inert stubs suffice; they just have to exist.
    useCancelBookingMutation: (): MutationTuple => [vi.fn(), { isLoading: false }],
    useGetCancellationPreviewQuery: (): QueryResult<unknown> => ({}),
    // Live tracking re-entry point (docs/domain/live-tracking.md) — no trip
    // yet in this fixture, so the "Suivre le trajet en direct" card simply
    // doesn't render (isTrackable stays false).
    useGetTripByBookingQuery: (): QueryResult<unknown> => ({}),
    // The Call button (useCallCounterpart) — never actually pressed in this
    // snapshot, an inert stub suffices.
    useLazyGetBookingContactPhoneQuery: (): [() => { unwrap: () => Promise<{ phone: string | null }> }, { isFetching: boolean }] => [
      () => ({ unwrap: async () => ({ phone: null }) }),
      { isFetching: false },
    ],
  }));
  // useCurrentPosition triggers a real expo-location permission request on
  // mount — irrelevant to what this snapshot verifies, and expo-location
  // isn't mocked in this test environment at all, so stub it directly
  // rather than let the real module load and throw.
  vi.doMock('../services/location/useCurrentPosition', () => ({
    useCurrentPosition: () => ({ status: 'idle', position: null }),
  }));
}

// ToastProvider must come from the *same* vi.resetModules() graph as
// BookingDetailScreen — see driver-ride-hub-screen.snapshot.test.tsx's
// identical note: a statically-imported ToastProvider binds to a
// ToastContext object from the pre-reset module instance, which a
// post-reset useToast() call (DriverCard's Call button, useCallCounterpart)
// won't match.
async function renderScreen(): Promise<ReturnType<typeof renderJSON>> {
  vi.resetModules();
  mockApi();
  const [{ default: BookingDetailScreen }, { ToastProvider }] = await Promise.all([
    import('../../app/bookings/[bookingId]'),
    import('@vaya/design-system'),
  ]);
  return renderJSON(
    <ToastProvider>
      <BookingDetailScreen />
    </ToastProvider>,
  );
}

describe('bookings/[bookingId].tsx snapshots', () => {
  it('accepted booking — real driver card, vehicle, and cancel footer', async () => {
    expect(await renderScreen()).toMatchSnapshot();
  });
});
