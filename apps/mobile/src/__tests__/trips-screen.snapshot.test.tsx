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
  routeKind: null,
};

const PAST_RIDE: Ride = {
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
    driverUserId: 'driver-amine',
    status: 'published',
  },
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
    // The rider hero card's own full-ride fetch (see RIDER_HERO_RIDE above).
    useGetRideQuery: (rideId: string): QueryResult<Ride> => ({
      data: rideId === RIDER_HERO_RIDE.id ? RIDER_HERO_RIDE : undefined,
    }),
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

  // A pure rider (no driverProfile) with a real accepted booking — exercises
  // the world-class TripCard's person-counterpart branch (driver avatar +
  // name + price tag over the dot→line→pin timeline), which the
  // driver-dashboard fixture above never renders since its driverProfile
  // makes the segmented control default to "Conducteur" instead.
  it('rider view — booking card shows the real driver as counterpart', async () => {
    mockApi({ bookings: [ACCEPTED_BOOKING] });
    expect(await renderTrips()).toMatchSnapshot();
  });
});
