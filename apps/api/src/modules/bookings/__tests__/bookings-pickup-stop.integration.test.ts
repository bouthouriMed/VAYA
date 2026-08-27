import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops } from '../../../db/schema/index.js';
import { createBooking } from '../bookings.service.js';
import { ValidationError } from '../../../lib/errors.js';

/**
 * Exercises the real Postgres instance (same discipline as
 * bookings.service.test.ts's seat-accounting suite) — this is the actual
 * server-side enforcement of docs/domain/ride-engine.md's business rules:
 * a booking's pickupStopId must belong to the ride being booked and be one
 * of the driver's actually-offered stops, free-form coordinates are
 * rejected for any ride that has stops, and legacy (stop-less) rides keep
 * working exactly as before. route_stops rows are inserted directly here
 * rather than generated via OSRM — this suite is about the booking-time
 * enforcement, not stop generation (already covered by
 * stop-candidates.integration.test.ts).
 */
describe('bookings.service — pickup-stop enforcement', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let riderId: string;
  let rideWithStopsId: string;
  let otherRideId: string;
  let legacyRideId: string;
  let stopId: string;
  let secondStopId: string;
  let otherRideStopId: string;
  const createdRiderIds: string[] = [];

  // One active (pending/accepted) booking per rider per ride is now
  // enforced server-side — each of these tests exercises a distinct
  // validation path via createBooking, several against the *same* ride, so
  // each needs its own rider rather than reusing the single seeded
  // `riderId` (which would otherwise collide with an earlier test's already
  // -accepted booking on that ride, regardless of what this call is
  // actually trying to test).
  async function freshRider(label: string): Promise<string> {
    const base = Date.now() % 10_000_000;
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}${createdRiderIds.length}`, fullName: label })
      .returning();
    createdRiderIds.push(rider!.id);
    return rider!.id;
  }

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}7`, fullName: 'Pickup Stop Test Driver' })
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
        color: 'Green',
        plateNumber: `PSTOP-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}8`, fullName: 'Pickup Stop Test Rider' })
      .returning();
    riderId = rider!.id;

    const [rideWithStops] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Origin',
        originLat: 36.8,
        originLng: 10.18,
        destinationLabel: 'Destination',
        destinationLat: 36.85,
        destinationLng: 10.2,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    rideWithStopsId = rideWithStops!.id;

    const [stop] = await db
      .insert(routeStops)
      .values({
        rideId: rideWithStopsId,
        sequence: 0,
        label: 'Test Stop',
        lat: 36.81,
        lng: 10.19,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    stopId = stop!.id;

    // A second, further-along stop on the same ride — Phase 13's
    // dropoff-stop tests need a stop that legitimately comes *after*
    // `stopId` on the route.
    const [secondStop] = await db
      .insert(routeStops)
      .values({
        rideId: rideWithStopsId,
        sequence: 1,
        label: 'Second Test Stop',
        lat: 36.83,
        lng: 10.195,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    secondStopId = secondStop!.id;

    // A second, unrelated ride with its own stop — proves cross-ride
    // stopId references are rejected.
    const [otherRide] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Other Origin',
        originLat: 36.9,
        originLng: 10.3,
        destinationLabel: 'Other Destination',
        destinationLat: 36.95,
        destinationLng: 10.35,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    otherRideId = otherRide!.id;

    const [otherStop] = await db
      .insert(routeStops)
      .values({
        rideId: otherRideId,
        sequence: 0,
        label: 'Other Stop',
        lat: 36.91,
        lng: 10.31,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    otherRideStopId = otherStop!.id;

    // Legacy ride: zero route_stops, published-before-Phase-4 shape.
    const [legacyRide] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Legacy Origin',
        originLat: 36.7,
        originLng: 10.1,
        destinationLabel: 'Legacy Destination',
        destinationLat: 36.75,
        destinationLng: 10.15,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    legacyRideId = legacyRide!.id;
  });

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.id, rideWithStopsId));
    await db.delete(rides).where(eq(rides.id, otherRideId));
    await db.delete(rides).where(eq(rides.id, legacyRideId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(users).where(eq(users.id, riderId));
    for (const id of createdRiderIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await closeDatabase();
  });

  it('accepts a valid pickupStopId and copies label/lat/lng from the stop', async () => {
    const booking = await createBooking(db, rideWithStopsId, riderId, {
      seatsRequested: 1,
      pickupStopId: stopId,
    });
    expect(booking.pickupStopId).toBe(stopId);
    expect(booking.pickupLabel).toBe('Test Stop');
    expect(booking.pickupLat).toBe(36.81);
    expect(booking.pickupLng).toBe(10.19);
  });

  it('rejects a pickupStopId belonging to a different ride', async () => {
    const otherRiderId = await freshRider('Pickup Stop Test Rider 2');
    await expect(
      createBooking(db, rideWithStopsId, otherRiderId, {
        seatsRequested: 1,
        pickupStopId: otherRideStopId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects free-form pickup coordinates for a ride that has stops', async () => {
    const otherRiderId = await freshRider('Pickup Stop Test Rider 3');
    await expect(
      createBooking(db, rideWithStopsId, otherRiderId, {
        seatsRequested: 1,
        pickup: { label: 'Arbitrary pin', lat: 36.82, lng: 10.2 },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('still accepts free-form coordinates for a legacy ride with zero route_stops', async () => {
    const booking = await createBooking(db, legacyRideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Legacy free-form pin', lat: 36.71, lng: 10.11 },
    });
    expect(booking.pickupStopId).toBeNull();
    expect(booking.pickupLabel).toBe('Legacy free-form pin');
  });

  it('rejects a pickupStopId for a ride with zero route_stops', async () => {
    const otherRiderId = await freshRider('Pickup Stop Test Rider 4');
    await expect(
      createBooking(db, legacyRideId, otherRiderId, {
        seatsRequested: 1,
        pickupStopId: stopId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  // Phase 13 (docs/roadmap/phase-13-search-engine.md): dropoff-stop
  // enforcement mirrors pickupStopId's, plus the "must come after pickup"
  // sequence check that pickup alone has no equivalent for.
  describe('dropoffStopId', () => {
    it('accepts a valid dropoffStopId after the pickup stop and copies label/lat/lng', async () => {
      const otherRiderId = await freshRider('Pickup Stop Test Rider 5');
      const booking = await createBooking(db, rideWithStopsId, otherRiderId, {
        seatsRequested: 1,
        pickupStopId: stopId,
        dropoffStopId: secondStopId,
      });
      expect(booking.dropoffStopId).toBe(secondStopId);
      expect(booking.dropoffLabel).toBe('Second Test Stop');
      expect(booking.dropoffLat).toBe(36.83);
      expect(booking.dropoffLng).toBe(10.195);
    });

    it('defaults dropoff fields to null when dropoffStopId is omitted (rides at the ride\'s own destination)', async () => {
      const otherRiderId = await freshRider('Pickup Stop Test Rider 6');
      const booking = await createBooking(db, rideWithStopsId, otherRiderId, {
        seatsRequested: 1,
        pickupStopId: stopId,
      });
      expect(booking.dropoffStopId).toBeNull();
      expect(booking.dropoffLabel).toBeNull();
    });

    it('rejects a dropoffStopId at or before the pickup stop on the route', async () => {
      const otherRiderId = await freshRider('Pickup Stop Test Rider 7');
      await expect(
        createBooking(db, rideWithStopsId, otherRiderId, {
          seatsRequested: 1,
          pickupStopId: stopId,
          dropoffStopId: stopId,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a dropoffStopId belonging to a different ride', async () => {
      const otherRiderId = await freshRider('Pickup Stop Test Rider 8');
      await expect(
        createBooking(db, rideWithStopsId, otherRiderId, {
          seatsRequested: 1,
          pickupStopId: stopId,
          dropoffStopId: otherRideStopId,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a dropoffStopId for a ride with zero route_stops', async () => {
      const otherRiderId = await freshRider('Pickup Stop Test Rider 9');
      await expect(
        createBooking(db, legacyRideId, otherRiderId, {
          seatsRequested: 1,
          pickup: { label: 'Legacy free-form pin', lat: 36.71, lng: 10.11 },
          dropoffStopId: stopId,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
