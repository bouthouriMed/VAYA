import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderJSON } from './test-utils/renderJSON';
import type { Booking, Ride } from '../state/api';

/**
 * Real react-test-renderer snapshots of driver/rides/[rideId].tsx
 * (2026-08-23 trips/notifications redesign) — the driver's real-time ride
 * management hub, consolidating what RideRequestsSheet + ManageRideSheet
 * used to split across two separate bottom sheets into one screen: route
 * preview, ride facts, a glassmorphic pending-request list with inline
 * accept/decline, a confirmed-passengers list, and a sticky cancel footer.
 */

vi.mock('expo-router', () => ({
  router: { back: vi.fn(), replace: vi.fn(), push: vi.fn(), canGoBack: vi.fn(() => false) },
  useLocalSearchParams: () => ({ rideId: 'ride-1' }),
}));

const RIDE: Ride = {
  id: 'ride-1',
  driverProfileId: 'dp-1',
  vehicleId: 'veh-1',
  routeId: null,
  originLabel: 'Tunis',
  originLat: 36.8065,
  originLng: 10.1815,
  destinationLabel: 'Sousse',
  destinationLat: 35.8256,
  destinationLng: 10.6369,
  departureAt: '2026-08-25T08:30:00',
  seatsTotal: 4,
  seatsAvailable: 2,
  contributionPerSeat: 12.5,
  status: 'published',
  routePolyline: null,
  estimatedDurationSec: 7200,
};

const PENDING_REQUEST: Booking = {
  id: 'booking-pending',
  rideId: 'ride-1',
  riderId: 'u-rider-1',
  seatsRequested: 1,
  contributionTotal: 12.5,
  status: 'pending',
  pickupStopId: null,
  pickupLabel: 'Angle Rue de Kairouan',
  pickupLat: 36.81,
  pickupLng: 10.19,
  dropoffStopId: null,
  dropoffLabel: null,
  dropoffLat: null,
  dropoffLng: null,
  requestedAt: '2026-08-24T09:00:00',
  respondedAt: null,
  rider: { id: 'u-rider-1', fullName: 'Dinara Kochakajeva', avatarUrl: null },
};

const ACCEPTED_REQUEST: Booking = {
  ...PENDING_REQUEST,
  id: 'booking-accepted',
  riderId: 'u-rider-2',
  status: 'accepted',
  respondedAt: '2026-08-24T09:05:00',
  rider: { id: 'u-rider-2', fullName: 'Karim Fassi', avatarUrl: null },
};

type QueryResult<T> = { data?: T; isLoading?: boolean };
type MutationTuple = [unknown, { isLoading: boolean }];

function mockApi(requests: Booking[]): void {
  vi.doMock('../state/api', () => ({
    useGetRideQuery: (): QueryResult<Ride> => ({ data: RIDE }),
    useListRequestsForRideQuery: (): QueryResult<Booking[]> => ({ data: requests }),
    useAcceptBookingMutation: (): MutationTuple => [vi.fn(), { isLoading: false }],
    useDeclineBookingMutation: (): MutationTuple => [vi.fn(), { isLoading: false }],
    // ManageRideSheet + DriverBookingDetailSheet's transitive hooks — both
    // rendered closed (visible=false) so inert stubs suffice.
    useCancelRideMutation: (): MutationTuple => [vi.fn(), { isLoading: false }],
    useCancelBookingMutation: (): MutationTuple => [vi.fn(), { isLoading: false }],
    useGetCancellationPreviewQuery: (): QueryResult<unknown> => ({}),
    useReportNoShowMutation: (): MutationTuple => [vi.fn(), { isLoading: false }],
  }));
}

async function renderScreen(requests: Booking[]): Promise<ReturnType<typeof renderJSON>> {
  vi.resetModules();
  mockApi(requests);
  const { default: DriverRideHubScreen } = await import('../../app/driver/rides/[rideId]');
  return renderJSON(<DriverRideHubScreen />);
}

describe('driver/rides/[rideId].tsx snapshots', () => {
  it('one pending request (inline Accepter/Refuser) and one confirmed passenger', async () => {
    expect(await renderScreen([PENDING_REQUEST, ACCEPTED_REQUEST])).toMatchSnapshot();
  });

  it('no requests yet — honest empty state, not a fabricated list', async () => {
    expect(await renderScreen([])).toMatchSnapshot();
  });
});
