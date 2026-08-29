import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, trips, bookings, ratings } from '../../../db/schema/index.js';
import { createBooking, acceptBooking } from '../../bookings/bookings.service.js';
import { runTripStalenessSweep } from '../trips.service.js';
import { AUTO_NO_SHOW_DRIVER_GRACE_MS, AUTO_NO_SHOW_PICKUP_WAIT_MS } from '@vaya/domain';
import { closeQueue } from '../../../lib/queue.js';

/**
 * M-104 (docs/unified_driver_and_passenger_journey.md §37 — "VAYA may also
 * automatically classify [a no-show] when evidence is sufficiently strong").
 * Confirmed 100% missing before this pass: no-show could only ever be
 * reported by a human tap (bookings.service.ts's reportNoShow). This suite
 * proves the trip-staleness sweep now genuinely closes both real cases the
 * pure `evaluateAutoNoShowClassification` (packages/domain) contract
 * defines, end to end against real Postgres — same
 * directly-manipulated-timestamp pattern trip-auto-completion.integration.
 * test.ts already establishes for simulating real elapsed time without an
 * actual multi-hour wait.
 */
describe('trips.service — automatic no-show classification (M-104)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  const riderIds: string[] = [];
  const rideIds: string[] = [];

  const ORIGIN = { lat: 36.7992, lng: 10.1811 };
  const DESTINATION = { lat: 36.8324, lng: 10.2334 };

  async function makeAcceptedBooking(suffix: string, departureAt: Date) {
    const base = Date.now() % 10_000_000;
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}${suffix}`, fullName: `AutoNoShow Rider ${suffix}` })
      .returning();
    riderIds.push(rider!.id);

    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Origin',
        originLat: ORIGIN.lat,
        originLng: ORIGIN.lng,
        destinationLabel: 'Destination',
        destinationLat: DESTINATION.lat,
        destinationLng: DESTINATION.lng,
        departureAt,
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 5,
        status: 'published',
        estimatedDurationSec: 3600,
      })
      .returning();
    rideIds.push(ride!.id);

    const booking = await createBooking(db, ride!.id, rider!.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: ORIGIN.lat, lng: ORIGIN.lng },
    });
    await acceptBooking(db, booking.id, driverUserId);
    const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });

    return { rideId: ride!.id, bookingId: booking.id, tripId: trip!.id, riderId: rider!.id };
  }

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'AutoNoShow Test Driver' })
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
        color: 'Grey',
        plateNumber: `AUTONS-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;
  }, 30_000);

  afterAll(async () => {
    for (const rideId of rideIds) {
      await db.delete(rides).where(eq(rides.id, rideId));
    }
    for (const riderId of riderIds) {
      await db.delete(users).where(eq(users.id, riderId));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await closeQueue();
    await closeDatabase();
  });

  it('classifies a driver no-show: departure long passed, trip never left scheduled, driver actively tracked but never near origin', async () => {
    const departureAt = new Date(Date.now() - AUTO_NO_SHOW_DRIVER_GRACE_MS - 60_000);
    const { tripId, bookingId, riderId } = await makeAcceptedBooking('a', departureAt);

    // Simulate a driver whose phone kept broadcasting (ruling out "phone
    // off") from well outside pickup-arrival radius the whole time —
    // driverEverNearOriginAt stays null, exactly the real signal
    // updateTripLocation would have set had the driver ever actually
    // arrived.
    await db
      .update(trips)
      .set({ locationUpdatedAt: new Date(departureAt.getTime() + 60_000) })
      .where(eq(trips.id, tripId));

    const result = await runTripStalenessSweep(db);
    expect(result.autoNoShowClassified).toBeGreaterThanOrEqual(1);

    const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
    expect(trip!.status).toBe('no_show');
    expect(trip!.autoNoShowClassifiedAt).not.toBeNull();

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    expect(booking!.status).toBe('no_show');

    // The driver is the reported (at-fault) party — the automatic rating is
    // recorded against the driver, attributed to the rider.
    const rating = await db.query.ratings.findFirst({ where: eq(ratings.tripId, tripId) });
    expect(rating).toBeDefined();
    expect(rating!.raterUserId).toBe(riderId);
    expect(rating!.role).toBe('rider_rates_driver');
  }, 20_000);

  it('classifies a passenger no-show: driver confirmed arrival at pickup and waited past the threshold with no boarding', async () => {
    const departureAt = new Date(Date.now() - AUTO_NO_SHOW_PICKUP_WAIT_MS - 60_000);
    const { tripId, bookingId } = await makeAcceptedBooking('b', departureAt);

    await db
      .update(trips)
      .set({
        status: 'pickup',
        pickupConfirmedAt: new Date(Date.now() - AUTO_NO_SHOW_PICKUP_WAIT_MS - 1_000),
        driverEverNearOriginAt: new Date(departureAt.getTime()),
        locationUpdatedAt: new Date(),
      })
      .where(eq(trips.id, tripId));

    const result = await runTripStalenessSweep(db);
    expect(result.autoNoShowClassified).toBeGreaterThanOrEqual(1);

    const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
    expect(trip!.status).toBe('no_show');

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    expect(booking!.status).toBe('no_show');

    // The rider is the reported (at-fault) party — the automatic rating is
    // recorded against the rider, attributed to the driver.
    const rating = await db.query.ratings.findFirst({ where: eq(ratings.tripId, tripId) });
    expect(rating).toBeDefined();
    expect(rating!.raterUserId).toBe(driverUserId);
    expect(rating!.role).toBe('driver_rates_rider');
  }, 20_000);

  it('conservative: a trip merely overdue with no corroborating signal at all is left untouched (silence is not evidence)', async () => {
    const departureAt = new Date(Date.now() - AUTO_NO_SHOW_DRIVER_GRACE_MS - 60_000);
    const { tripId, bookingId } = await makeAcceptedBooking('c', departureAt);
    // No locationUpdatedAt set at all — the driver's phone never produced a
    // single fix. Deliberately left as-is (trips.locationUpdatedAt is null
    // by default on a freshly-accepted booking).

    await runTripStalenessSweep(db);

    const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
    expect(trip!.status).toBe('scheduled');
    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    expect(booking!.status).toBe('accepted');
  }, 20_000);
});
