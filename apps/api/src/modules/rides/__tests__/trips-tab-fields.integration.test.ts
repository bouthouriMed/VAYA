import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { closeQueue } from '../../../lib/queue.js';
import { users, driverProfiles, vehicles, rides, bookings, trips } from '../../../db/schema/index.js';
import { listMyRides } from '../rides.service.js';
import { listMyBookings } from '../../bookings/bookings.service.js';
import { startTrip, completeTrip, confirmPassengerAboard, getPendingRatingForUser } from '../../trips/trips.service.js';

/**
 * The fields the trips tab ("Mes trajets") reads, against real Postgres:
 * how many seat requests still wait on each of the driver's rides, the
 * live trip status on each reservation, and which trip a pending rating is
 * about.
 */
describe('trips tab fields', () => {
  const db = getDatabase();
  const base = Date.now() % 10_000_000;
  const userIds: string[] = [];
  let driverUserId: string;
  let profileId: string;
  let rideId: string;
  let acceptedId: string;
  let riderId: string;

  beforeAll(async () => {
    const [driver] = await db.insert(users).values({ phone: `+216${base}1`, fullName: 'Trips Tab Driver' }).returning();
    driverUserId = driver!.id;
    const [profile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    profileId = profile!.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId: profileId, make: 'Kia', model: 'Picanto', color: 'Gris', plateNumber: `TT-${base}`, seatCount: 4 })
      .returning();
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId: profileId,
        vehicleId: vehicle!.id,
        originLabel: 'Tunis',
        originLat: 36.8,
        originLng: 10.18,
        destinationLabel: 'Sousse',
        destinationLat: 35.83,
        destinationLng: 10.6,
        departureAt: new Date(Date.now() - 60_000),
        seatsTotal: 3,
        seatsAvailable: 2,
        contributionPerSeat: 15,
        status: 'published',
        estimatedDurationSec: 7200,
      })
      .returning();
    rideId = ride!.id;

    const riders = await db
      .insert(users)
      .values([1, 2, 3, 4].map((n) => ({ phone: `+216${base}${n + 1}`, fullName: `Rider ${n}` })))
      .returning();
    userIds.push(driverUserId, ...riders.map((r) => r.id));
    riderId = riders[0]!.id;

    const point = { pickupLabel: 'Ben Arous', pickupLat: 36.74, pickupLng: 10.23, contributionTotal: 15, seatsRequested: 1 };
    const inserted = await db
      .insert(bookings)
      .values([
        { ...point, rideId, riderId: riders[0]!.id, status: 'accepted' },
        { ...point, rideId, riderId: riders[1]!.id, status: 'pending', expiresAt: new Date(Date.now() + 90 * 60_000) },
        { ...point, rideId, riderId: riders[2]!.id, status: 'pending', expiresAt: new Date(Date.now() + 30 * 60_000) },
        // Past its deadline, not yet swept: no longer answerable.
        { ...point, rideId, riderId: riders[3]!.id, status: 'pending', expiresAt: new Date(Date.now() - 60_000) },
      ])
      .returning();
    acceptedId = inserted[0]!.id;
    await db.insert(trips).values({ bookingId: acceptedId, rideId, status: 'scheduled' });
  }, 30_000);

  afterAll(async () => {
    await db.delete(bookings).where(eq(bookings.rideId, rideId));
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(vehicles).where(eq(vehicles.driverProfileId, profileId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, profileId));
    await db.delete(users).where(inArray(users.id, userIds));
    await closeQueue();
    await closeDatabase();
  });

  it("counts only the requests the driver can still answer, with the soonest deadline", async () => {
    const [ride] = await listMyRides(db, driverUserId);
    expect(ride).toMatchObject({ id: rideId, pendingRequestCount: 2, acceptedBookingCount: 1 });
    const soonest = ride!.nextRequestExpiresAt!.getTime() - Date.now();
    expect(soonest).toBeGreaterThan(25 * 60_000);
    expect(soonest).toBeLessThan(31 * 60_000);
  });

  it("follows the reservation's live trip, then names the trip to rate", async () => {
    const find = async () => (await listMyBookings(db, riderId)).find((b) => b.id === acceptedId)!;
    expect(await find()).toMatchObject({ tripStatus: 'scheduled', ride: { estimatedDurationSec: 7200, driverAvatarUrl: null } });

    const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, acceptedId) });
    await startTrip(db, trip!.id, driverUserId);
    expect((await find()).tripStatus).toBe('driver_approaching');
    await confirmPassengerAboard(db, trip!.id, driverUserId);
    expect((await find()).tripStatus).toBe('active');

    await completeTrip(db, trip!.id, driverUserId);
    expect((await find()).tripStatus).toBe('completed');
    expect(await getPendingRatingForUser(db, riderId)).toMatchObject({
      tripId: trip!.id,
      bookingId: acceptedId,
      originLabel: 'Ben Arous',
      destinationLabel: 'Sousse',
      counterpartName: 'Trips Tab Driver',
    });
  });
});
