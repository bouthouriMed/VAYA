import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderJSON } from './test-utils/renderJSON';
import type { Booking, Ride, RouteStop, Trip } from '../state/api';
import type DriverRideHubScreenComponent from '../../app/driver/rides/[rideId]';
import type { ToastProvider as ToastProviderComponent } from '@vaya/design-system';

/**
 * `ToastProvider` must come from the *same* `vi.resetModules()` graph as
 * `DriverRideHubScreen` — see search-results-screen.snapshot.test.tsx's
 * identical note: a statically-imported `ToastProvider` binds to a
 * `ToastContext` object from the pre-reset module instance, which a
 * post-reset `useToast()` call won't match.
 */
async function loadScreen(): Promise<{
  DriverRideHubScreen: typeof DriverRideHubScreenComponent;
  ToastProvider: typeof ToastProviderComponent;
}> {
  const [{ default: DriverRideHubScreen }, { ToastProvider }] = await Promise.all([
    import('../../app/driver/rides/[rideId]'),
    import('@vaya/design-system'),
  ]);
  return { DriverRideHubScreen, ToastProvider };
}

vi.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: vi.fn(async () => ({ status: 'denied' })),
  watchPositionAsync: vi.fn(async () => ({ remove: vi.fn() })),
  Accuracy: { High: 4 },
}));

// analytics.ts's real sink now dispatches through the real Redux store
// (docs/domain/admin-platform.md) — this suite's `vi.doMock('../state/api',
// ...)` below only stubs the handful of hooks this screen calls, which
// would otherwise crash `configureStore` when `store.ts` itself resolves
// the same mocked module for `api.reducerPath`/`api.reducer`. Matches the
// existing precedent in search-trust-screen.snapshot.test.tsx.
vi.mock('../services/analytics/analytics', () => ({
  trackEvent: vi.fn(),
}));

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
  routeKind: null,
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
  pickupWalkMeters: null,
  dropoffStopId: null,
  dropoffLabel: null,
  dropoffLat: null,
  dropoffLng: null,
  dropoffWalkMeters: null,
  requestedAt: '2026-08-24T09:00:00',
  respondedAt: null,
  expiresAt: null,
  rider: { id: 'u-rider-1', fullName: 'Dinara Kochakajeva', avatarUrl: null },
};

// The pickup + dropoff points confirmed via the driver publish flow's map
// selection — the getRideStops endpoint returns only driver-selected
// stops (see its own doc comment in state/api.ts), so this fixture models
// exactly that shape rather than the full generated-candidates set.
const RIDE_STOPS: RouteStop[] = [
  {
    id: 'stop-pickup',
    rideId: 'ride-1',
    sequence: 0,
    label: 'Avenue Habib Bourguiba, Tunis',
    lat: 36.8, lng: 10.18,
    roadSnapped: true,
    deviationMeters: 20,
    deviationSeconds: 10,
    suitabilityScore: 0.9,
    roadClass: 'primary',
    isDriverSelected: true,
  },
  {
    id: 'stop-dropoff',
    rideId: 'ride-1',
    sequence: 5,
    label: 'Boulevard Hedi Chaker, Sousse',
    lat: 35.82, lng: 10.63,
    roadSnapped: true,
    deviationMeters: 15,
    deviationSeconds: 8,
    suitabilityScore: 0.85,
    roadClass: 'primary',
    isDriverSelected: true,
  },
];

const ACCEPTED_REQUEST: Booking = {
  ...PENDING_REQUEST,
  id: 'booking-accepted',
  riderId: 'u-rider-2',
  status: 'accepted',
  respondedAt: '2026-08-24T09:05:00',
  rider: { id: 'u-rider-2', fullName: 'Karim Fassi', avatarUrl: null },
};

// Live tracking (docs/domain/live-tracking.md): every accepted booking gets
// its own `trips` row (created at acceptance) — 'scheduled' here is the
// real starting state, exercising the "Démarrer le trajet" footer action.
const ACCEPTED_TRIP: Trip = {
  id: 'trip-accepted',
  bookingId: 'booking-accepted',
  rideId: 'ride-1',
  status: 'scheduled',
  simulationStartedAt: null,
  pickupConfirmedAt: null,
  dropoffAt: null,
  completedAt: null,
  riderSettlementConfirmedAt: null,
  driverSettlementConfirmedAt: null,
  startedAt: null,
};

type QueryResult<T> = { data?: T; isLoading?: boolean };
type MutationTuple = [() => { unwrap: () => Promise<unknown> }, { isLoading: boolean }];

function mockMutation(): MutationTuple {
  return [() => ({ unwrap: async () => ({}) }), { isLoading: false }];
}

function mockApi(requests: Booking[], tripsByBookingId: Record<string, Trip> = {}): void {
  vi.doMock('../state/api', () => ({
    useGetRideQuery: (): QueryResult<Ride> => ({ data: RIDE }),
    useGetRideStopsQuery: (): QueryResult<RouteStop[]> => ({ data: RIDE_STOPS }),
    useListRequestsForRideQuery: (): QueryResult<Booking[]> => ({ data: requests }),
    useAcceptBookingMutation: (): MutationTuple => mockMutation(),
    useDeclineBookingMutation: (): MutationTuple => mockMutation(),
    // ManageRideSheet + DriverBookingDetailSheet's transitive hooks — both
    // rendered closed (visible=false) so inert stubs suffice.
    useCancelRideMutation: (): MutationTuple => mockMutation(),
    useCancelBookingMutation: (): MutationTuple => mockMutation(),
    useGetCancellationPreviewQuery: (): QueryResult<unknown> => ({}),
    useReportNoShowMutation: (): MutationTuple => mockMutation(),
    // Live tracking (docs/domain/live-tracking.md): one trip subscription
    // per accepted booking (AcceptedBookingTripBridge), plus the journey
    // actions and GPS-broadcast mutations the footer/board-button wire up.
    useGetTripByBookingQuery: (bookingId: string): QueryResult<Trip> => ({ data: tripsByBookingId[bookingId] }),
    useStartTripMutation: (): MutationTuple => mockMutation(),
    useConfirmPassengerAboardMutation: (): MutationTuple => mockMutation(),
    useCompleteTripMutation: (): MutationTuple => mockMutation(),
    useUpdateTripLocationMutation: (): MutationTuple => mockMutation(),
    useReportTrackingIssueMutation: (): MutationTuple => mockMutation(),
    // RequestDetailSheet's transitive hook — rendered closed (visible=false)
    // so an inert stub suffices, same as the other closed sheets above.
    useGetBookingDetourPreviewQuery: (): QueryResult<unknown> => ({}),
    // DriverBookingDetailSheet's Call button (useCallCounterpart) — rendered
    // closed (visible=false) so an inert stub suffices, same as the other
    // closed-sheet hooks above.
    useLazyGetBookingContactPhoneQuery: (): [() => { unwrap: () => Promise<{ phone: string | null }> }, { isFetching: boolean }] => [
      () => ({ unwrap: async () => ({ phone: null }) }),
      { isFetching: false },
    ],
  }));
}

async function renderScreen(
  requests: Booking[],
  tripsByBookingId: Record<string, Trip> = {},
): Promise<ReturnType<typeof renderJSON>> {
  vi.resetModules();
  mockApi(requests, tripsByBookingId);
  const { DriverRideHubScreen, ToastProvider } = await loadScreen();
  return renderJSON(
    <ToastProvider>
      <DriverRideHubScreen />
    </ToastProvider>,
  );
}

describe('driver/rides/[rideId].tsx snapshots', () => {
  it('one pending request (inline Accepter/Refuser) and one confirmed passenger', async () => {
    expect(
      await renderScreen([PENDING_REQUEST, ACCEPTED_REQUEST], { 'booking-accepted': ACCEPTED_TRIP }),
    ).toMatchSnapshot();
  });

  it('no requests yet — honest empty state, not a fabricated list', async () => {
    expect(await renderScreen([])).toMatchSnapshot();
  });

  it('an active trip shows its real status and the "Terminer le trajet" footer action, not "Démarrer"', async () => {
    const tree = await renderScreen([ACCEPTED_REQUEST], {
      'booking-accepted': { ...ACCEPTED_TRIP, status: 'active', startedAt: '2026-08-24T09:10:00' },
    });
    const json = JSON.stringify(tree);
    expect(json).toContain('rides.rideDetail.tripStatus.active');
    expect(json).toContain('rides.rideDetail.journeyCompleteCta');
    expect(json).not.toContain('rides.rideDetail.journeyStartCta');
    expect(json).not.toContain('rides.rideDetail.passengerAboard"');
  });
});
