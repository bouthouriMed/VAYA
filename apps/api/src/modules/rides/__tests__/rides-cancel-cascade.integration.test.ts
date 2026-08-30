import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, bookings, trips } from '../../../db/schema/index.js';
import { createBooking, acceptBooking } from '../../bookings/bookings.service.js';
import { startTrip } from '../../trips/trips.service.js';
import { cancelRide } from '../rides.service.js';
import { ConflictError } from '../../../lib/errors.js';

/**
 * Journey-contract second pass (docs/unified_driver_and_passenger_journey.md
 * §46/EDGE-046, §36/M-101/INV-04) — real Postgres. Confirmed live (this pass)
 * that `cancelRide` previously had ZERO cascade to its bookings at all (a
 * passenger's `accepted` booking stayed `accepted` after the ride was
 * cancelled — the exact gap `journey-7-cancellation.api.test.ts`'s
 * "ride-cancel" case documented as FAIL). Covers: pending + accepted
 * bookings both close, trips cancel, capacity/matching naturally stop via
 * the ride's own terminal status, and the hard M-101/INV-04 guard (no
 * cancellation once any passenger's trip has genuinely started).
 */
describe('rides.service — cancelRide cascade (EDGE-046, M-101/INV-04)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  const riderIds: string[] = [];

  async function makeRide(seatsTotal = 3) {
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
        departureAt: new Date(Date.now() + 6 * 60 * 60_000),
        seatsTotal,
        seatsAvailable: seatsTotal,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    return ride!;
  }

  async function makeRider(suffix: string) {
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${Date.now() % 10_000_000}${suffix}`, fullName: `Rider ${suffix}` })
      .returning();
    riderIds.push(rider!.id);
    return rider!;
  }

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}8`, fullName: 'Cascade Test Driver' })
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
        color: 'White',
        plateNumber: `CASCADE-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.driverProfileId, driverProfileId));
    for (const riderId of riderIds) {
      await db.delete(users).where(eq(users.id, riderId));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await closeDatabase();
  });

  it('cancelling a ride cascades to every pending and accepted booking, and cancels their trips', async () => {
    const ride = await makeRide(3);
    const acceptedRider = await makeRider('a');
    const pendingRider = await makeRider('b');

    const acceptedBooking = await createBooking(db, ride.id, acceptedRider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup A', lat: 36.8, lng: 10.18 },
    });
    await acceptBooking(db, acceptedBooking.id, driverUserId);

    const pendingBooking = await createBooking(db, ride.id, pendingRider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup B', lat: 36.81, lng: 10.19 },
    });

    const cancelled = await cancelRide(db, ride.id, driverUserId);
    expect(cancelled.status).toBe('cancelled');

    const [acceptedAfter] = await db.select().from(bookings).where(eq(bookings.id, acceptedBooking.id));
    expect(acceptedAfter!.status).toBe('cancelled_by_driver');

    const [pendingAfter] = await db.select().from(bookings).where(eq(bookings.id, pendingBooking.id));
    // EDGE-046: "stale requests unacceptable after" — the still-pending
    // request is closed too, not left dangling against a dead ride.
    expect(pendingAfter!.status).toBe('cancelled_by_driver');

    const acceptedTrip = await db.query.trips.findFirst({
      where: eq(trips.bookingId, acceptedBooking.id),
    });
    expect(acceptedTrip!.status).toBe('cancelled');
  });

  it('M-101/INV-04: cannot cancel a ride once any passenger\'s trip has genuinely started', async () => {
    const ride = await makeRide(2);
    const rider = await makeRider('c');
    const booking = await createBooking(db, ride.id, rider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup C', lat: 36.8, lng: 10.18 },
    });
    await acceptBooking(db, booking.id, driverUserId);

    const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });
    await startTrip(db, trip!.id, driverUserId);

    const [rideBefore] = await db.select().from(rides).where(eq(rides.id, ride.id));

    await expect(cancelRide(db, ride.id, driverUserId)).rejects.toBeInstanceOf(ConflictError);

    // Untouched — the rejected cancel attempt had no effect: the ride's
    // status is exactly what it was before the attempt (real journey
    // progression via startTrip, not `cancelled`), and the booking is still
    // accepted, not cascaded.
    const [rideAfter] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(rideAfter!.status).toBe(rideBefore!.status);
    expect(rideAfter!.status).not.toBe('cancelled');
    const [bookingAfter] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(bookingAfter!.status).toBe('accepted');
  });
});
