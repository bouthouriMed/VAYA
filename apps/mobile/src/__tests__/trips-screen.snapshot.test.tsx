import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderJSON } from './test-utils/renderJSON';
import type { Booking, DriverProfile, MyRide, PendingRating, Ride } from '../state/api';

/**
 * Real react-test-renderer snapshots of (tabs)/trips.tsx ("Mes trajets",
 * direction C): the top card for whatever matters now, the "À traiter"
 * rows, and the day-grouped agenda — for a driver who also rides, a pure
 * rider, a live trip, a missed start, a fresh rating and the first run.
 * Every case-by-case rule lives in src/features/trips/agenda.ts and its
 * unit tests; these pin what the screen renders from it.
 *
 * System time is pinned (Date only) because statuses, countdowns and day
 * headings are all relative to now.
 */

const FIXED_NOW = new Date('2026-08-22T10:00:00');
const FUTURE_DEPARTURE = '2026-08-23T08:30:00';

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), navigate: vi.fn(), canGoBack: vi.fn(() => false) },
  Redirect: () => null,
  // No booking_requested-notification deep link in these fixtures.
  useLocalSearchParams: () => ({}),
}));

// trips.tsx guards itself behind accessToken (guest browsing landed on
// explore/publish, not this identity-scoped tab) — these snapshots exercise
// the signed-in experience, so the store needs a token to get past the
// guard at all.
vi.mock('../state/store', () => ({
  useAppSelector: (selector: (s: { auth: { accessToken: string }; language: { locale: string } }) => unknown) =>
    selector({ auth: { accessToken: 'test-token' }, language: { locale: 'fr' } }),
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
  verificationDeclineReason: null,
  verificationDeclineMessage: null,
  verificationAttempt: 1,
  vehicles: [],
  documents: [],
};

const HERO_RIDE: MyRide = {
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
  routeKind: null,
  pendingRequestCount: 2,
  nextRequestExpiresAt: '2026-08-22T20:00:00',
  acceptedBookingCount: 1,
};

const PAST_RIDE: MyRide = {
  ...HERO_RIDE,
  id: 'ride-2',
  departureAt: '2026-08-15T08:30:00',
  status: 'completed',
  seatsAvailable: 0,
};

// Full ride detail behind ACCEPTED_BOOKING.rideId — the rider hero card
// (unlike the plain TripCard list rows) needs real coordinates/polyline for
// its map preview, which listMyBookings' slim embedded `ride` summary
// doesn't carry, so trips.tsx fetches it separately via useGetRideQuery.
const RIDER_HERO_RIDE: Ride = {
  id: 'ride-other',
  driverProfileId: 'dp-amine',
  vehicleId: 'veh-amine',
  routeId: null,
  originLabel: 'Tunis',
  originLat: 36.8065,
  originLng: 10.1815,
  destinationLabel: 'Hammamet',
  destinationLat: 36.4,
  destinationLng: 10.6,
  departureAt: FUTURE_DEPARTURE,
  seatsTotal: 4,
  seatsAvailable: 2,
  contributionPerSeat: 10.5,
  status: 'published',
  routePolyline: null,
  estimatedDurationSec: 3600,
  routeKind: null,
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
  pickupWalkMeters: null,
  dropoffStopId: null,
  dropoffLabel: null,
  dropoffLat: null,
  dropoffLng: null,
  dropoffWalkMeters: null,
  requestedAt: '2026-08-22T08:00:00',
  respondedAt: '2026-08-22T08:30:00',
  expiresAt: null,
  ride: {
    originLabel: 'Tunis',
    destinationLabel: 'Hammamet',
    departureAt: FUTURE_DEPARTURE,
    contributionPerSeat: 10.5,
    driverFullName: 'Amine Ben Salah',
    driverUserId: 'driver-amine',
    driverAvatarUrl: null,
    estimatedDurationSec: 3600,
    status: 'published',
  },
  tripId: 'trip-1',
  tripStatus: 'scheduled',
};

// Today, 10:45 — leaves in 45 minutes.
const SOON_BOOKING: Booking = {
  ...ACCEPTED_BOOKING,
  id: 'booking-soon',
  pickupWalkMeters: 420,
  ride: { ...ACCEPTED_BOOKING.ride!, departureAt: '2026-08-22T10:45:00' },
};

// The driver tapped "Démarrer" and has the passenger on board.
const LIVE_BOOKING: Booking = {
  ...ACCEPTED_BOOKING,
  id: 'booking-live',
  tripStatus: 'active',
  ride: { ...ACCEPTED_BOOKING.ride!, departureAt: '2026-08-22T09:40:00', status: 'in_progress' },
};

// Departure passed 20 minutes ago, one passenger confirmed, not started.
const MISSED_START_RIDE: MyRide = {
  ...HERO_RIDE,
  id: 'ride-missed',
  departureAt: '2026-08-22T09:40:00',
  pendingRequestCount: 0,
  nextRequestExpiresAt: null,
};

const PENDING_REQUEST: Booking = {
  ...ACCEPTED_BOOKING,
  id: 'booking-pending',
  status: 'pending',
  tripId: null,
  tripStatus: null,
  respondedAt: null,
  expiresAt: '2026-08-22T21:00:00',
  ride: { ...ACCEPTED_BOOKING.ride!, departureAt: '2026-08-24T09:00:00' },
};

const DECLINED_BOOKING: Booking = {
  ...ACCEPTED_BOOKING,
  id: 'booking-declined',
  status: 'declined',
  tripId: null,
  tripStatus: null,
  ride: { ...ACCEPTED_BOOKING.ride!, departureAt: '2026-08-10T09:00:00' },
};

const FRESH_RATING: PendingRating = {
  tripId: 'trip-done',
  role: 'rider_rates_driver',
  counterpartName: 'Karim Trabelsi',
  completedAt: '2026-08-22T09:30:00',
  bookingId: 'booking-done',
  originLabel: 'Sfax',
  destinationLabel: 'Tunis',
};

type QueryResult<T> = { data?: T; isLoading?: boolean; isError?: boolean };

// 2026-08-23 redesign: trips.tsx no longer wires CancellationSheet /
// RideRequestsSheet / ManageRideSheet / DriverBookingDetailSheet directly —
// tapping a trip card now navigates to a real pushed screen instead
// (bookings/[bookingId].tsx, driver/rides/[rideId].tsx), so those sheets'
// transitive hooks are no longer part of this screen's render tree at all.
function mockApi({
  bookings = [],
  driverProfile = null,
  myRides = [],
  pendingRating = null,
}: {
  bookings?: Booking[];
  driverProfile?: DriverProfile | null;
  myRides?: MyRide[];
  pendingRating?: PendingRating | null;
}): void {
  vi.doMock('../state/api', () => ({
    useListMyBookingsQuery: (): QueryResult<Booking[]> => ({ data: bookings }),
    useGetMyDriverProfileQuery: (): QueryResult<DriverProfile> => ({
      data: driverProfile ?? undefined,
    }),
    useListMyRidesQuery: (): QueryResult<MyRide[]> => ({ data: myRides }),
    // The top card's map for a reservation (the list entry has no route).
    useGetRideQuery: (rideId: string): QueryResult<Ride> => ({
      data: rideId === RIDER_HERO_RIDE.id ? RIDER_HERO_RIDE : undefined,
    }),
    useGetPendingRatingQuery: (): QueryResult<PendingRating | null> => ({ data: pendingRating }),
    useCreateTripRatingMutation: () => [vi.fn()],
    // Header notification bell — same query the explore tab's bell uses.
    useListNotificationsQuery: (): QueryResult<unknown[]> => ({ data: [] }),
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

  it('drives and rides — next drive on top with its requests, then the agenda with role chips', async () => {
    mockApi({
      bookings: [ACCEPTED_BOOKING, PENDING_REQUEST, DECLINED_BOOKING],
      driverProfile: DRIVER_PROFILE,
      myRides: [HERO_RIDE, PAST_RIDE],
    });
    expect(await renderTrips()).toMatchSnapshot();
  });

  it('first run — nothing yet, find or publish', async () => {
    mockApi({});
    expect(await renderTrips()).toMatchSnapshot();
  });

  it('rider only — confirmed seat on top with the meeting point and the driver, no role chips', async () => {
    mockApi({ bookings: [SOON_BOOKING, PENDING_REQUEST] });
    expect(await renderTrips()).toMatchSnapshot();
  });

  it('live — the passenger is on board, follow live on top', async () => {
    mockApi({ bookings: [LIVE_BOOKING], driverProfile: DRIVER_PROFILE, myRides: [HERO_RIDE] });
    expect(await renderTrips()).toMatchSnapshot();
  });

  it('missed start — the driver is asked to start the ride', async () => {
    mockApi({ driverProfile: DRIVER_PROFILE, myRides: [MISSED_START_RIDE, HERO_RIDE] });
    expect(await renderTrips()).toMatchSnapshot();
  });

  it('just finished — rating card on top, next trip in the agenda', async () => {
    mockApi({ bookings: [PENDING_REQUEST], pendingRating: FRESH_RATING });
    expect(await renderTrips()).toMatchSnapshot();
  });
});
