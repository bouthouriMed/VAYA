import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, trips } from '../../../db/schema/index.js';
import { createBooking, acceptBooking } from '../../bookings/bookings.service.js';
import { runRideExpirySweep } from '../trips.service.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * A ride whose status never left `published`/`full` used to stay there
 * forever once its departure passed — the trip-level safety net has no
 * trip to act on when nobody booked (and the app then showed it as
 * "en cours" indefinitely). Real Postgres; elapsed time is simulated by
 * moving `departureAt` back rather than waiting.
 */
describe('trips.service — ride expiry sweep', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  const riderIds: string[] = [];
  const rideIds: string[] = [];
  const HOUR = 3_600_000;

  async function makeRide(departureAt: Date) {
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Origin',
        originLat: 36.7992,
        originLng: 10.1811,
        destinationLabel: 'Destination',
        destinationLat: 36.8324,
        destinationLng: 10.2334,
        departureAt,
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 5,
        status: 'published',
        estimatedDurationSec: 3600,
      })
      .returning();
    rideIds.push(ride!.id);
    return ride!;
  }

  /** A ride with one accepted passenger, then moved `hoursAgo` into the past. */
  async function makeBookedRide(suffix: string, hoursAgo: number) {
    const ride = await makeRide(new Date(Date.now() + HOUR));
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${Date.now() % 10_000_000}${suffix}`, fullName: `Rider ${suffix}` })
      .returning();
    riderIds.push(rider!.id);
    const booking = await createBooking(db, ride.id, rider!.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: 36.7992, lng: 10.1811 },
    });
    await acceptBooking(db, booking.id, driverUserId);
    await db.update(rides).set({ departureAt: new Date(Date.now() - hoursAgo * HOUR) }).where(eq(rides.id, ride.id));
    const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });
    return { rideId: ride.id, tripId: trip!.id };
  }

  const statusOf = async (rideId: string) =>
    (await db.query.rides.findFirst({ where: eq(rides.id, rideId) }))!.status;

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}7`, fullName: 'Ride Expiry Test Driver' })
      .returning();
    driverUserId = driverUser!.id;
    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    driverProfileId = driverProfile!.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId, make: 'Test', model: 'Car', color: 'Blue', plateNumber: `EXPRY-${base}`, seatCount: 4 })
      .returning();
    vehicleId = vehicle!.id;
  }, 30_000);

  afterAll(async () => {
    for (const rideId of rideIds) await db.delete(rides).where(eq(rides.id, rideId));
    for (const riderId of riderIds) await db.delete(users).where(eq(users.id, riderId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await closeQueue();
    await closeDatabase();
  });

  it('expires a long-past ride nobody booked, and leaves a recently-departed one alone', async () => {
    const longPast = await makeRide(new Date(Date.now() - 48 * HOUR));
    const recent = await makeRide(new Date(Date.now() - 2 * HOUR)); // 1h route + 3h grace not yet over

    await runRideExpirySweep(db);

    expect(await statusOf(longPast.id)).toBe('expired');
    expect(await statusOf(recent.id)).toBe('published');
  });

  it('completes a past ride whose passenger trip was completed without the ride ever being started', async () => {
    const { rideId, tripId } = await makeBookedRide('8', 48);
    await db.update(trips).set({ status: 'completed', completedAt: new Date() }).where(eq(trips.id, tripId));

    await runRideExpirySweep(db);

    expect(await statusOf(rideId)).toBe('completed');
  });

  it('never closes a ride while a passenger trip is still live', async () => {
    const { rideId } = await makeBookedRide('9', 48); // trip still `scheduled`

    await runRideExpirySweep(db);

    expect(await statusOf(rideId)).toBe('published');
  });
});
