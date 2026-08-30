import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops, trips, bookings } from '../../../db/schema/index.js';
import { createBooking, acceptBooking } from '../../bookings/bookings.service.js';
import { startTrip, updateTripLocation } from '../../trips/trips.service.js';
import { searchRides } from '../matching.service.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * M-091/EDGE-050 (docs/unified_driver_and_passenger_journey.md §30/§50/§62
 * — the audit's own P0 finding, docs/tdd_journey_test_matrix.md's
 * `B.matching.in-progress-still-ahead-matches` /
 * `B.matching.in-progress-already-passed-rejected`, mirrored by the
 * expected-FAIL Playwright journey at
 * tests/e2e/tests/journeys/journey-5-active-trip-discovery.api.test.ts):
 * a trip already in progress is matchable against the driver's real,
 * live-reported position and remaining route — never its stale stored
 * origin — and a pickup already behind that live position is never
 * offered, however close it sits to the rider.
 *
 * Drives the real production path end-to-end (createBooking -> acceptBooking
 * -> startTrip -> updateTripLocation, exactly what apps/mobile's driver flow
 * calls), against real Postgres, rather than hand-constructing trips/rides
 * rows directly — the same discipline as trip-auto-inference.integration.test.ts.
 * The route polyline itself is hand-encoded (see that file's own comment):
 * this sandbox's OSRM has no prepared Tunisia map data, so a real non-empty
 * `rides.routePolyline` has to be produced without a live routing call.
 */

function encodeSignedNumber(num: number): string {
  let sgn = num << 1;
  if (num < 0) sgn = ~sgn;
  return encodeNumber(sgn);
}
function encodeNumber(num: number): string {
  let encoded = '';
  while (num >= 0x20) {
    encoded += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  encoded += String.fromCharCode(num + 63);
  return encoded;
}
function encodePolyline(points: { lat: number; lng: number }[]): string {
  let output = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    output += encodeSignedNumber(lat - prevLat);
    output += encodeSignedNumber(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return output;
}

describe('matching.service — M-091/EDGE-050: in-progress ride visibility against the driver\'s real live position', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let riderId: string;
  const rideIds: string[] = [];
  const stopIds: string[] = [];

  // A straight ~15km line — a 2-point polyline resamples exactly onto this
  // segment, so route-fraction == the linear-interpolation parameter `t`.
  const ROUTE_ORIGIN = { lat: 36.7, lng: 10.1 };
  const ROUTE_DESTINATION = { lat: 36.8, lng: 10.2 };
  function point(t: number): { lat: number; lng: number } {
    return {
      lat: ROUTE_ORIGIN.lat + t * (ROUTE_DESTINATION.lat - ROUTE_ORIGIN.lat),
      lng: ROUTE_ORIGIN.lng + t * (ROUTE_DESTINATION.lng - ROUTE_ORIGIN.lng),
    };
  }

  const driverLivePosition = point(0.45); // The driver's real, reported "now".
  const passedStop = point(0.2); // Behind the driver — already driven past.
  const aheadPickupStop = point(0.7); // Genuinely still ahead.
  const aheadDropoffStop = point(0.85); // Further still ahead.

  let inProgressRideId: string;
  let noPositionRideId: string;

  beforeAll(async () => {
    const base = Math.floor(Math.random() * 1_000_000_000);

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'In-Progress Match Driver' })
      .returning();
    driverUserId = driverUser!.id;

    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    driverProfileId = driverProfile!.id;

    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId,
        make: 'Test',
        model: 'Car',
        color: 'Red',
        plateNumber: `INPRG-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}2`, fullName: 'In-Progress Match Rider' })
      .returning();
    riderId = rider!.id;

    const encodedPolyline = encodePolyline([ROUTE_ORIGIN, ROUTE_DESTINATION]);

    // Ride 1: goes fully in-progress with a real reported live position.
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Route Origin',
        originLat: ROUTE_ORIGIN.lat,
        originLng: ROUTE_ORIGIN.lng,
        destinationLabel: 'Route Destination',
        destinationLat: ROUTE_DESTINATION.lat,
        destinationLng: ROUTE_DESTINATION.lng,
        departureAt: new Date(Date.now() - 60_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 10,
        status: 'published',
        routePolyline: encodedPolyline,
        estimatedDurationSec: 1200,
      })
      .returning();
    inProgressRideId = ride!.id;
    rideIds.push(inProgressRideId);

    // Real production path: book the origin leg, accept it (creates the
    // `trips` row), start the trip (flips rides.status -> in_progress), then
    // report a real live position partway along the route. Done BEFORE the
    // route_stops below are inserted — a free-form pickup on a ride that
    // already has driver-selected stops would otherwise trigger
    // assertRealDetourWithinAllowance's real (unreachable, in this sandbox)
    // routing-engine check; a zero-stop ride's free-form pickup has no such
    // requirement, exactly like every ride published before route_stops
    // existed.
    const booking = await createBooking(db, inProgressRideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Route Origin', lat: ROUTE_ORIGIN.lat, lng: ROUTE_ORIGIN.lng },
    });
    await acceptBooking(db, booking.id, driverUserId);
    const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });
    await startTrip(db, trip!.id, driverUserId);
    await updateTripLocation(db, trip!.id, driverUserId, driverLivePosition);

    const rideAfter = await db.query.rides.findFirst({ where: eq(rides.id, inProgressRideId) });
    expect(rideAfter!.status).toBe('in_progress'); // Fixture sanity check.

    for (const [seq, stop] of [passedStop, aheadPickupStop, aheadDropoffStop].entries()) {
      const [row] = await db
        .insert(routeStops)
        .values({
          rideId: inProgressRideId,
          sequence: seq,
          label: `Stop ${seq}`,
          lat: stop.lat,
          lng: stop.lng,
          roadSnapped: true,
          isDriverSelected: true,
        })
        .returning();
      stopIds.push(row!.id);
    }

    // Ride 2: also in_progress, same route/stops shape, but its driver has
    // never reported a single GPS fix — used to prove this tier never
    // fabricates "current position" from the stale stored origin.
    const [ride2] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Route Origin (no fix)',
        originLat: ROUTE_ORIGIN.lat,
        originLng: ROUTE_ORIGIN.lng,
        destinationLabel: 'Route Destination (no fix)',
        destinationLat: ROUTE_DESTINATION.lat,
        destinationLng: ROUTE_DESTINATION.lng,
        departureAt: new Date(Date.now() - 60_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 10,
        status: 'in_progress',
        routePolyline: encodedPolyline,
        estimatedDurationSec: 1200,
      })
      .returning();
    noPositionRideId = ride2!.id;
    rideIds.push(noPositionRideId);

    const [noPositionStop] = await db
      .insert(routeStops)
      .values({
        rideId: noPositionRideId,
        sequence: 0,
        label: 'Ahead stop, no live position',
        lat: aheadPickupStop.lat,
        lng: aheadPickupStop.lng,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    stopIds.push(noPositionStop!.id);
    const [noPositionDropoffStop] = await db
      .insert(routeStops)
      .values({
        rideId: noPositionRideId,
        sequence: 1,
        label: 'Ahead dropoff, no live position',
        lat: aheadDropoffStop.lat,
        lng: aheadDropoffStop.lng,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    stopIds.push(noPositionDropoffStop!.id);
  }, 30_000);

  afterAll(async () => {
    for (const stopId of stopIds) {
      await db.delete(routeStops).where(eq(routeStops.id, stopId));
    }
    for (const rideId of rideIds) {
      await db.delete(bookings).where(eq(bookings.rideId, rideId));
      await db.delete(rides).where(eq(rides.id, rideId));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(users).where(eq(users.id, riderId));
    await closeQueue();
    await closeDatabase();
  });

  it('M-091: a genuinely feasible remaining corridor ahead of the driver is a real, discoverable match', async () => {
    const result = await searchRides(db, {
      originLat: aheadPickupStop.lat,
      originLng: aheadPickupStop.lng,
      destinationLat: aheadDropoffStop.lat,
      destinationLng: aheadDropoffStop.lng,
      when: new Date(),
    });
    const match = result.candidates.find((c) => c.rideId === inProgressRideId);
    expect(match).toBeDefined();
    expect(match!.pickupViable).toBe(true);
    expect(match!.dropoffViable).toBe(true);
  });

  it('EDGE-050: a pickup already behind the driver\'s real live position is never offered, even though a real stop exists exactly there', async () => {
    const result = await searchRides(db, {
      originLat: passedStop.lat,
      originLng: passedStop.lng,
      destinationLat: aheadDropoffStop.lat,
      destinationLng: aheadDropoffStop.lng,
      when: new Date(),
    });
    const match = result.candidates.find((c) => c.rideId === inProgressRideId);
    expect(match).toBeUndefined();
  });

  it('never fabricates a "current position" from the stale stored origin — an in-progress ride with no real reported GPS fix is not matched', async () => {
    const result = await searchRides(db, {
      originLat: aheadPickupStop.lat,
      originLng: aheadPickupStop.lng,
      destinationLat: aheadDropoffStop.lat,
      destinationLng: aheadDropoffStop.lng,
      when: new Date(),
    });
    const match = result.candidates.find((c) => c.rideId === noPositionRideId);
    expect(match).toBeUndefined();
  });
});
