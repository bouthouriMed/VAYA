import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderJSON } from './test-utils/renderJSON';
import type { Booking, DriverProfile, Ride } from '../state/api';

/**
 * Real react-test-renderer snapshots of (tabs)/trips.tsx (Stitch reference:
 * "My Rides" driver dashboard, stitch/publish_ride/my-rides-driver-dashboard.html)
 * — pins the tab-root headline treatment (headlineDisplay) and the two
 * designed states: the driver dashboard (hero card for the next upcoming
 * drive + passenger list below) and the first-run rider empty state.
 *
 * System time is pinned (Date only — timers/network stay real) because
 * `formatWhen` renders "Aujourd'hui, HH:MM" vs a weekday date relative to
 * now, and `pickNextUpcomingRide` classifies upcoming-ness against it;
 * without the pin both the hero selection and its labels would drift.
 */

const FIXED_NOW = new Date('2026-08-22T10:00:00');
const FUTURE_DEPARTURE = '2026-08-23T08:30:00';

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), navigate: vi.fn(), canGoBack: vi.fn(() => false) },
  Redirect: () => null,
}));

// trips.tsx guards itself behind accessToken (guest browsing landed on
// explore/publish, not this identity-scoped tab) — these snapshots exercise
// the signed-in experience, so the store needs a token to get past the
// guard at all.
vi.mock('../state/store', () => ({
  useAppSelector: (selector: (s: { auth: { accessToken: string } }) => unknown) =>
    selector({ auth: { accessToken: 'test-token' } }),
}));

const DRIVER_PROFILE: DriverProfile = {
  id: 'dp-1',
  userId: 'u-me',
  verificationStatus: 'approved',
  bio: null,
  ratingAvg: 4.7,
  tripCount: 12,
  punctualityScore: 95,
  reliabilityScore: 92,
  approvedAt: '2026-07-01T09:00:00',
  vehicles: [],
  documents: [],
};

const HERO_RIDE: Ride = {
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
  departureAt: FUTURE_DEPARTURE,
  seatsTotal: 4,
  seatsAvailable: 3,
  contributionPerSeat: 12.5,
  status: 'published',
  routePolyline: null,
  estimatedDurationSec: 7200,
};

const PAST_RIDE: Ride = {
  ...HERO_RIDE,
  id: 'ride-2',
  departureAt: '2026-08-15T08:30:00',
  status: 'completed',
  seatsAvailable: 0,
};

const ACCEPTED_BOOKING: Booking = {
  id: 'booking-1',
  rideId: 'ride-other',
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
    departureAt: FUTURE_DEPARTURE,
    contributionPerSeat: 10.5,
    driverFullName: 'Amine Ben Salah',
  },
};

type QueryResult<T> = { data?: T; isLoading?: boolean; isError?: boolean };
type MutationTuple = [unknown, { isLoading: boolean }];

function mockApi({
  bookings = [],
  driverProfile = null,
  myRides = [],
}: {
  bookings?: Booking[];
  driverProfile?: DriverProfile | null;
  myRides?: Ride[];
}): void {
  vi.doMock('../state/api', () => ({
    useListMyBookingsQuery: (): QueryResult<Booking[]> => ({ data: bookings }),
    useGetMyDriverProfileQuery: (): QueryResult<DriverProfile> => ({
      data: driverProfile ?? undefined,
    }),
    useListMyRidesQuery: (): QueryResult<Ride[]> => ({ data: myRides }),
    // Header notification bell — same query the explore tab's bell uses.
    useListNotificationsQuery: (): QueryResult<unknown[]> => ({ data: [] }),
    // Transitive hooks from CancellationSheet / RideRequestsSheet /
    // ManageRideSheet / DriverBookingDetailSheet — all rendered closed
    // (visible=false → no-op), so inert stubs suffice; they just have to exist.
    useCancelBookingMutation: (): MutationTuple => [vi.fn(), { isLoading: false }],
    useGetCancellationPreviewQuery: (): QueryResult<unknown> => ({}),
    useListRequestsForRideQuery: (): QueryResult<Booking[]> => ({}),
    useAcceptBookingMutation: (): MutationTuple => [vi.fn(), { isLoading: false }],
    useDeclineBookingMutation: (): MutationTuple => [vi.fn(), { isLoading: false }],
    useCancelRideMutation: (): MutationTuple => [vi.fn(), { isLoading: false }],
    useReportNoShowMutation: (): MutationTuple => [vi.fn(), { isLoading: false }],
  }));
}

async function renderTrips(): Promise<ReturnType<typeof renderJSON>> {
  vi.resetModules();
  const { default: TripsScreen } = await import('../../app/(tabs)/trips');
  return renderJSON(<TripsScreen />);
}

describe('trips.tsx snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_NOW, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('driver dashboard — hero ride card over segmented lists', async () => {
    mockApi({
      bookings: [ACCEPTED_BOOKING],
      driverProfile: DRIVER_PROFILE,
      myRides: [HERO_RIDE, PAST_RIDE],
    });
    expect(await renderTrips()).toMatchSnapshot();
  });

  it('first run — no bookings, no profile, rider empty state', async () => {
    mockApi({});
    expect(await renderTrips()).toMatchSnapshot();
  });
});
