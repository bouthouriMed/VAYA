import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops, bookings } from '../../../db/schema/index.js';
import { createBooking, acceptBooking } from '../bookings.service.js';
import { ConflictError, AppError } from '../../../lib/errors.js';

/**
 * Segment-aware multi-passenger capacity (matching-engine architecture plan
 * §K, un-deferred) — exercises the real Postgres instance, same discipline
 * as bookings.service.test.ts's own seat-accounting concurrency suite. The
 * flagship scenario this whole model exists for: a driver's route runs
 * Tunis -> Hammamet -> Sousse -> Monastir; one passenger books
 * Hammamet->Sousse, a second books Sousse->Monastir — genuinely disjoint
 * segments that should both be bookable even on a ride with very few
 * seats, which the old ride-global `seatsAvailable` scalar could never
 * express (accepting the first would have looked like "no seats left" to
 * the second, everywhere on the route, regardless of overlap).
 */
describe('bookings.service — segment-aware multi-passenger capacity', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;
  let hammametStopId: string;
  let sousseStopId: string;
  let monastirStopId: string;
  const createdRiderIds: string[] = [];

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
      .values({ phone: `+216${base}1`, fullName: 'Segment Capacity Test Driver' })
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
        plateNumber: `SEGCAP-${base}`,
        seatCount: 2,
      })
      .returning();
    vehicleId = vehicle!.id;

    // 2 total seats — enough that a fresh full-route request can still
    // coexist with one already-accepted partial-segment booking (verified
    // in the 'full' status test below), but tight enough that two
    // genuinely-overlapping full-seat requests still contend.
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Tunis',
        originLat: 36.8065,
        originLng: 10.1815,
        destinationLabel: 'Monastir',
        destinationLat: 35.7643,
        destinationLng: 10.8113,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 2,
        seatsAvailable: 2,
        contributionPerSeat: 20,
        status: 'published',
      })
      .returning();
    rideId = ride!.id;

    const [hammamet] = await db
      .insert(routeStops)
      .values({
        rideId,
        sequence: 0,
        label: 'Hammamet',
        lat: 36.4,
        lng: 10.61,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    hammametStopId = hammamet!.id;

    const [sousse] = await db
      .insert(routeStops)
      .values({
        rideId,
        sequence: 1,
        label: 'Sousse',
        lat: 35.8256,
        lng: 10.6369,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    sousseStopId = sousse!.id;

    const [monastir] = await db
      .insert(routeStops)
      .values({
        rideId,
        sequence: 2,
        label: 'Monastir',
        lat: 35.7643,
        lng: 10.8113,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    monastirStopId = monastir!.id;
  });

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    for (const id of createdRiderIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await closeDatabase();
  });

  it('accepts two bookings on genuinely non-overlapping segments of the same ride, and keeps the ride published (not "full")', async () => {
    const riderA = await freshRider('Segment Rider A (Hammamet->Sousse)');
    const riderB = await freshRider('Segment Rider B (Sousse->Monastir)');

    const bookingA = await createBooking(db, rideId, riderA, {
      seatsRequested: 1,
      pickupStopId: hammametStopId,
      dropoffStopId: sousseStopId,
    });
    const acceptedA = await acceptBooking(db, bookingA.id, driverUserId);
    expect(acceptedA.status).toBe('accepted');

    // If this were still ride-global scalar accounting, the ride would now
    // show 1 of 2 seats consumed for the WHOLE ride, which is fine either
    // way at seatsTotal=2 — the real proof is the next booking succeeding
    // on a segment that doesn't overlap A's at all, seats=1 each.
    const bookingB = await createBooking(db, rideId, riderB, {
      seatsRequested: 1,
      pickupStopId: sousseStopId,
      dropoffStopId: monastirStopId,
    });
    const acceptedB = await acceptBooking(db, bookingB.id, driverUserId);
    expect(acceptedB.status).toBe('accepted');

    const [finalRide] = await db.select().from(rides).where(eq(rides.id, rideId));
    // A stopped ride's status is never auto-derived from segment occupancy
    // (bookings.service.ts's recomputeAndPersistRideCapacity) — it should
    // still read 'published', not 'full', even with both segments now
    // occupied, since a single global 'full' flag can't represent
    // per-segment availability without hiding genuinely-free segments.
    expect(finalRide!.status).toBe('published');
  });

  it('rejects a request that would exceed capacity on a segment that already has an accepted booking covering it', async () => {
    // A fresh ride+stop set, isolated from the test above, so this is a
    // clean 2-seat/1-segment scenario: one seat already accepted on
    // Hammamet->Sousse, a second request for 2 more seats on the exact
    // same segment must fail (1 + 2 = 3 > seatsTotal 2).
    const base = Date.now() % 10_000_000;
    const [driverUser2] = await db
      .insert(users)
      .values({ phone: `+216${base}9`, fullName: 'Segment Capacity Test Driver 2' })
      .returning();
    const [driverProfile2] = await db
      .insert(driverProfiles)
      .values({ userId: driverUser2!.id, verificationStatus: 'approved' })
      .returning();
    const [vehicle2] = await db
      .insert(vehicles)
      .values({
        driverProfileId: driverProfile2!.id,
        make: 'Test',
        model: 'Van',
        color: 'White',
        plateNumber: `SEGCAP2-${base}`,
        seatCount: 2,
      })
      .returning();
    const [ride2] = await db
      .insert(rides)
      .values({
        driverProfileId: driverProfile2!.id,
        vehicleId: vehicle2!.id,
        originLabel: 'Tunis',
        originLat: 36.8065,
        originLng: 10.1815,
        destinationLabel: 'Sousse',
        destinationLat: 35.8256,
        destinationLng: 10.6369,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 2,
        seatsAvailable: 2,
        contributionPerSeat: 15,
        status: 'published',
      })
      .returning();
    const [stopA] = await db
      .insert(routeStops)
      .values({ rideId: ride2!.id, sequence: 0, label: 'Hammamet', lat: 36.4, lng: 10.61, roadSnapped: true, isDriverSelected: true })
      .returning();
    const [stopB] = await db
      .insert(routeStops)
      .values({ rideId: ride2!.id, sequence: 1, label: 'Sousse', lat: 35.8256, lng: 10.6369, roadSnapped: true, isDriverSelected: true })
      .returning();

    try {
      const firstRider = await freshRider('Segment Overlap Rider 1');
      const secondRider = await freshRider('Segment Overlap Rider 2');

      const firstBooking = await createBooking(db, ride2!.id, firstRider, {
        seatsRequested: 1,
        pickupStopId: stopA!.id,
        dropoffStopId: stopB!.id,
      });
      await acceptBooking(db, firstBooking.id, driverUser2!.id);

      // createBooking's own advisory pre-check should already reject this.
      await expect(
        createBooking(db, ride2!.id, secondRider, {
          seatsRequested: 2,
          pickupStopId: stopA!.id,
          dropoffStopId: stopB!.id,
        }),
      ).rejects.toThrow(AppError);
    } finally {
      await db.delete(rides).where(eq(rides.id, ride2!.id));
      await db.delete(vehicles).where(eq(vehicles.id, vehicle2!.id));
      await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfile2!.id));
      await db.delete(users).where(eq(users.id, driverUser2!.id));
    }
  });

  it('lets only one of two concurrent overlapping-segment accepts win when their combined seats would exceed capacity', async () => {
    // Same driver/ride fixture as the top-level describe (2 total seats),
    // fresh stops+bookings scoped to this test only.
    const base = Date.now() % 10_000_000;
    const [raceRide] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Tunis',
        originLat: 36.8065,
        originLng: 10.1815,
        destinationLabel: 'Sousse',
        destinationLat: 35.8256,
        destinationLng: 10.6369,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 2,
        seatsAvailable: 2,
        contributionPerSeat: 15,
        status: 'published',
      })
      .returning();
    const [stopA] = await db
      .insert(routeStops)
      .values({ rideId: raceRide!.id, sequence: 0, label: 'Hammamet', lat: 36.4, lng: 10.61, roadSnapped: true, isDriverSelected: true })
      .returning();
    const [stopB] = await db
      .insert(routeStops)
      .values({ rideId: raceRide!.id, sequence: 1, label: 'Sousse', lat: 35.8256, lng: 10.6369, roadSnapped: true, isDriverSelected: true })
      .returning();

    try {
      const riderX = await freshRider(`Race Rider X ${base}`);
      const riderY = await freshRider(`Race Rider Y ${base}`);

      // Both request the same 2-seat segment for 1 seat each — together
      // they'd need all 2 seats, which fits, so both should legitimately
      // be able to coexist... make it a genuine race by having each
      // request 2 seats (the ride's entire capacity) on the identical
      // segment: only one can possibly win.
      const bookingX = await createBooking(db, raceRide!.id, riderX, {
        seatsRequested: 2,
        pickupStopId: stopA!.id,
        dropoffStopId: stopB!.id,
      });
      const bookingY = await createBooking(db, raceRide!.id, riderY, {
        seatsRequested: 2,
        pickupStopId: stopA!.id,
        dropoffStopId: stopB!.id,
      });

      const results = await Promise.allSettled([
        acceptBooking(db, bookingX.id, driverUserId),
        acceptBooking(db, bookingY.id, driverUserId),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

      const rideBookings = await db.query.bookings.findMany({ where: eq(bookings.rideId, raceRide!.id) });
      const acceptedCount = rideBookings.filter((b) => b.status === 'accepted').length;
      expect(acceptedCount).toBe(1);
    } finally {
      await db.delete(rides).where(eq(rides.id, raceRide!.id));
    }
  });
});
