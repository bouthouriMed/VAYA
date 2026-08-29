import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, bookings } from '../../../db/schema/index.js';
import { createBooking, acceptBooking, cancelBooking } from '../bookings.service.js';
import { ConflictError } from '../../../lib/errors.js';

// Exercises the real Postgres instance from docker-compose — this is
// deliberately an integration test, not a mocked unit test. The bug being
// guarded against (apps/api/src/modules/bookings/bookings.service.ts's old
// check-then-separate-update pattern) only manifests under genuine
// concurrent access to the same row; mocking the database away would prove
// nothing about whether the fix actually holds under Postgres's real
// row-level locking.
describe('bookings.service — seat-accounting concurrency', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;
  let riderAId: string;
  let riderBId: string;
  let bookingAId: string;
  let bookingBId: string;

  beforeAll(async () => {
    // users.phone is varchar(20) — keep fixture numbers short but unique.
    const base = Date.now() % 10_000_000;
    const suffix = base;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'Test Driver' })
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
        color: 'Blue',
        plateNumber: `TEST-${suffix}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    // Only one seat available — the fixture that makes the race meaningful:
    // two concurrent accepts both requesting this one seat must not both
    // succeed.
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Test Origin',
        originLat: 36.8,
        originLng: 10.18,
        destinationLabel: 'Test Destination',
        destinationLat: 36.85,
        destinationLng: 10.2,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 1,
        seatsAvailable: 1,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    rideId = ride!.id;

    const [riderA] = await db
      .insert(users)
      .values({ phone: `+216${base}2`, fullName: 'Rider A' })
      .returning();
    riderAId = riderA!.id;

    const [riderB] = await db
      .insert(users)
      .values({ phone: `+216${base}3`, fullName: 'Rider B' })
      .returning();
    riderBId = riderB!.id;

    const bookingA = await createBooking(db, rideId, riderAId, {
      seatsRequested: 1,
      pickup: { label: 'Test pickup', lat: 36.8, lng: 10.18 },
    });
    bookingAId = bookingA.id;

    const bookingB = await createBooking(db, rideId, riderBId, {
      seatsRequested: 1,
      pickup: { label: 'Test pickup', lat: 36.8, lng: 10.18 },
    });
    bookingBId = bookingB.id;
  });

  afterAll(async () => {
    // rides -> bookings -> trips all cascade-delete; vehicles/driverProfiles
    // don't cascade from rides, so they're cleaned up explicitly.
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(users).where(eq(users.id, riderAId));
    await db.delete(users).where(eq(users.id, riderBId));
    await closeDatabase();
  });

  it('lets only one of two concurrent accepts win when a single seat is available', async () => {
    const results = await Promise.allSettled([
      acceptBooking(db, bookingAId, driverUserId),
      acceptBooking(db, bookingBId, driverUserId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    const [finalRide] = await db.select().from(rides).where(eq(rides.id, rideId));
    // The old bug: two concurrent accepts against a stale read could both
    // "succeed" and leave seatsAvailable wrong (e.g. still 1, or negative)
    // instead of correctly reflecting exactly one seat consumed.
    expect(finalRide!.seatsAvailable).toBe(0);
    expect(finalRide!.status).toBe('full');
  });

  it('restores the seat on cancellation without exceeding seatsTotal', async () => {
    // Re-query rather than assume Promise.allSettled resolution order
    // matches array order — find whichever booking actually won above.
    const rideBookings = await db.query.bookings.findMany({ where: eq(bookings.rideId, rideId) });
    const acceptedBooking = rideBookings.find((b) => b.status === 'accepted');
    if (!acceptedBooking)
      throw new Error('Expected an accepted booking fixture from the prior test');

    await cancelBooking(db, acceptedBooking.id, driverUserId, 'change_of_plans');

    const [finalRide] = await db.select().from(rides).where(eq(rides.id, rideId));
    expect(finalRide!.seatsAvailable).toBe(1);
    expect(finalRide!.seatsAvailable).toBeLessThanOrEqual(finalRide!.seatsTotal);
    expect(finalRide!.status).toBe('published');
  });
});
