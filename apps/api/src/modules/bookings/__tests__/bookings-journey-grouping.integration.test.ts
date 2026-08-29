import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, bookings } from '../../../db/schema/index.js';
import { createBooking, acceptBooking, runBookingExpirySweep } from '../bookings.service.js';
import { AppError } from '../../../lib/errors.js';

/**
 * Journey-contract second pass (docs/unified_driver_and_passenger_journey.md
 * §20, M-051/052/055/056/058, EDGE-grouping-1/2, INV-03) — real Postgres.
 * Confirmed live (this pass, before the fix) that none of this existed:
 * `createBooking` had no cross-ride cap at all, `acceptBooking` never
 * touched any other ride's bookings, and nothing ever set a booking to
 * `expired` at runtime.
 */
describe('bookings.service — "same journey" cross-ride request grouping (M-051/052/055/056/058)', () => {
  const db = getDatabase();
  const riderIds: string[] = [];
  const driverIds: string[] = [];
  const driverProfileIds: string[] = [];
  const vehicleIds: string[] = [];
  const rideIds: string[] = [];

  const TUNIS = { lat: 36.8065, lng: 10.1815 };
  const SOUSSE = { lat: 35.8256, lng: 10.6369 };

  // A fresh rider per test — each test exhausts (or nearly exhausts) the
  // MAX_ACTIVE_REQUESTS_PER_JOURNEY cap by design, so sharing one rider
  // across tests would have a later test start already at the cap from an
  // earlier test's still-pending bookings.
  async function makeRider(suffix: string): Promise<string> {
    const base = Date.now() % 10_000_000;
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}r${suffix}`, fullName: `Grouping Rider ${suffix}` })
      .returning();
    riderIds.push(rider!.id);
    return rider!.id;
  }

  async function makeDriverWithRide(
    suffix: string,
    departureAt: Date,
    destination: { label: string; lat: number; lng: number } = { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
  ) {
    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}${suffix}`, fullName: `Grouping Driver ${suffix}` })
      .returning();
    const driverUserId = driverUser!.id;
    driverIds.push(driverUserId);

    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    driverProfileIds.push(driverProfile!.id);

    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId: driverProfile!.id,
        make: 'Test',
        model: 'Car',
        color: 'Blue',
        plateNumber: `GRP${suffix}-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleIds.push(vehicle!.id);

    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId: driverProfile!.id,
        vehicleId: vehicle!.id,
        originLabel: 'Tunis',
        originLat: TUNIS.lat,
        originLng: TUNIS.lng,
        destinationLabel: destination.label,
        destinationLat: destination.lat,
        destinationLng: destination.lng,
        departureAt,
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 20,
        status: 'published',
      })
      .returning();
    rideIds.push(ride!.id);
    return { driverUserId, rideId: ride!.id };
  }

  afterAll(async () => {
    for (const rideId of rideIds) {
      await db.delete(rides).where(eq(rides.id, rideId));
    }
    for (const vehicleId of vehicleIds) {
      await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    }
    for (const driverProfileId of driverProfileIds) {
      await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    }
    for (const driverUserId of driverIds) {
      await db.delete(users).where(eq(users.id, driverUserId));
    }
    for (const riderId of riderIds) {
      await db.delete(users).where(eq(users.id, riderId));
    }
    await closeDatabase();
  });

  it('M-051/052: a rider can hold up to 3 active requests for the same journey; a 4th is rejected', async () => {
    const riderId = await makeRider('051');
    const departureAt = new Date(Date.now() + 6 * 60 * 60_000);
    const rideA = await makeDriverWithRide('a', departureAt);
    const rideB = await makeDriverWithRide('b', departureAt);
    const rideC = await makeDriverWithRide('c', departureAt);
    const rideD = await makeDriverWithRide('d', departureAt);

    async function requestSameJourney(rideId: string) {
      return createBooking(db, rideId, riderId, {
        seatsRequested: 1,
        pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
      });
    }

    await requestSameJourney(rideA.rideId);
    await requestSameJourney(rideB.rideId);
    await requestSameJourney(rideC.rideId);

    let caught: unknown;
    try {
      await requestSameJourney(rideD.rideId);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(409);
    expect((caught as AppError).code).toBe('TOO_MANY_ACTIVE_REQUESTS_FOR_JOURNEY');
  }, 30_000);

  it('M-055/056/INV-03: accepting one request auto-supersedes the rider\'s other pending requests for the same journey, leaving exactly one confirmed', async () => {
    const riderId = await makeRider('055');
    const departureAt = new Date(Date.now() + 8 * 60 * 60_000);
    const rideE = await makeDriverWithRide('e', departureAt);
    const rideF = await makeDriverWithRide('f', departureAt);
    const rideG = await makeDriverWithRide('g', departureAt);

    async function requestSameJourney(rideId: string) {
      return createBooking(db, rideId, riderId, {
        seatsRequested: 1,
        pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
      });
    }

    const bookingE = await requestSameJourney(rideE.rideId);
    const bookingF = await requestSameJourney(rideF.rideId);
    const bookingG = await requestSameJourney(rideG.rideId);

    const acceptedF = await acceptBooking(db, bookingF.id, rideF.driverUserId);
    expect(acceptedF.status).toBe('accepted');

    const [rowE] = await db.select().from(bookings).where(eq(bookings.id, bookingE.id));
    const [rowG] = await db.select().from(bookings).where(eq(bookings.id, bookingG.id));
    expect(rowE!.status).toBe('superseded');
    expect(rowG!.status).toBe('superseded');

    // Never more than one confirmed booking for the same journey (M-056).
    const [rowF] = await db.select().from(bookings).where(eq(bookings.id, bookingF.id));
    expect(rowF!.status).toBe('accepted');
  }, 30_000);

  it('M-058: an expired request closes only that request — a sibling request for a genuinely different journey is untouched', async () => {
    const riderId = await makeRider('058');
    const departureAt = new Date(Date.now() + 10 * 60 * 60_000);
    const rideH = await makeDriverWithRide('h', departureAt);
    // A genuinely different ride destination — its booking's dropoff
    // resolves to it (omitted/free-form, defaulting to the ride's own
    // destination) and so is never grouped with bookingH.
    const rideI = await makeDriverWithRide('i', departureAt, {
      label: 'Somewhere else entirely',
      lat: 33.8869,
      lng: 9.5375, // Tunisia's far south
    });

    const bookingH = await createBooking(db, rideH.rideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
    });
    const bookingI = await createBooking(db, rideI.rideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
    });

    // Force bookingH's deadline into the past directly (real sweep timing
    // is minutes away; this proves the sweep's own query/transition logic
    // without waiting on the scheduler).
    await db.update(bookings).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(bookings.id, bookingH.id));

    const result = await runBookingExpirySweep(db);
    expect(result.expired).toBeGreaterThanOrEqual(1);

    const [rowH] = await db.select().from(bookings).where(eq(bookings.id, bookingH.id));
    const [rowI] = await db.select().from(bookings).where(eq(bookings.id, bookingI.id));
    expect(rowH!.status).toBe('expired');
    expect(rowI!.status).toBe('pending'); // untouched — a genuinely different journey.
  }, 30_000);
});
