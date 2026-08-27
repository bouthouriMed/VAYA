import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, trips, bookings, notifications } from '../../../db/schema/index.js';
import { createBooking, acceptBooking } from '../../bookings/bookings.service.js';
import { startTrip, updateTripLocation, confirmPassengerAboard, runTripStalenessSweep } from '../trips.service.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * "The trip never closes itself" gap: a driver forgetting (or ignoring)
 * "Terminer le trajet" used to leave a trip `active`/`arriving` forever —
 * no rating prompt, no honest end state. Two real, independent mechanisms
 * now close that gap (docs comments on both point back here):
 * - GPS-confirmed tight-radius auto-completion, exercised in the first
 *   test below (real driver location updates, real Postgres — not mocked).
 * - The periodic staleness-sweep safety net for when GPS itself has gone
 *   quiet, exercised in the second/third tests via directly manipulated
 *   `startedAt`/`locationUpdatedAt` timestamps (simulating real elapsed
 *   time without an actual multi-hour test run).
 */
describe('trips.service — trip auto-completion', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  const riderIds: string[] = [];
  const rideIds: string[] = [];

  const PICKUP = { lat: 36.7992, lng: 10.1811 };
  const DESTINATION = { lat: 36.8324, lng: 10.2334 };

  async function makeTripInFlight(suffix: string) {
    const base = Date.now() % 10_000_000;
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}${suffix}`, fullName: `Rider ${suffix}` })
      .returning();
    riderIds.push(rider!.id);

    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Origin',
        originLat: PICKUP.lat,
        originLng: PICKUP.lng,
        destinationLabel: 'Destination',
        destinationLat: DESTINATION.lat,
        destinationLng: DESTINATION.lng,
        departureAt: new Date(Date.now() + 3_600_000),
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
      pickup: { label: 'Pickup', lat: PICKUP.lat, lng: PICKUP.lng },
    });
    await acceptBooking(db, booking.id, driverUserId);
    const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });
    await startTrip(db, trip!.id, driverUserId);
    await confirmPassengerAboard(db, trip!.id, driverUserId); // -> active

    return { rideId: ride!.id, bookingId: booking.id, tripId: trip!.id, riderId: rider!.id };
  }

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'Auto-Complete Test Driver' })
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
        plateNumber: `AUTOC-${base}`,
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

  it('auto-completes the trip once GPS confirms genuine arrival (tight radius), with the same side effects as a manual "Terminer"', async () => {
    const { tripId, bookingId, riderId } = await makeTripInFlight('2');

    // First ping: within the wide "approach" radius but not the tight
    // "arrived" one -> arriving, not yet completed.
    const approaching = await updateTripLocation(db, tripId, driverUserId, {
      lat: DESTINATION.lat + 0.002, // ~220m
      lng: DESTINATION.lng,
    });
    expect(approaching.trip.status).toBe('arriving');

    // Second ping: now genuinely at the destination -> auto-completes.
    const arrived = await updateTripLocation(db, tripId, driverUserId, {
      lat: DESTINATION.lat,
      lng: DESTINATION.lng,
    });
    expect(arrived.trip.status).toBe('completed');
    expect(arrived.trip.completedAt).not.toBeNull();

    // Same side effects completeTrip's manual path produces.
    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    expect(booking!.status).toBe('completed');

    const ride = await db.query.rides.findFirst({ where: eq(rides.id, (await db.query.trips.findFirst({ where: eq(trips.id, tripId) }))!.rideId) });
    expect(ride!.status).toBe('completed');

    const riderNotif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, riderId), eq(notifications.type, 'trip_completed')),
      orderBy: (n, { desc }) => desc(n.createdAt),
    });
    expect(riderNotif).toBeDefined();
  }, 20_000);

  it('the staleness sweep sends a one-time reminder for a trip overdue past its estimated duration, GPS still live, and never re-sends it', async () => {
    const { tripId, riderId } = await makeTripInFlight('3');

    // Simulate "45 minutes past a 1h estimate" without a real 105-minute wait.
    await db
      .update(trips)
      .set({
        startedAt: new Date(Date.now() - (3600 + 45 * 60) * 1000),
        locationUpdatedAt: new Date(), // still fresh
      })
      .where(eq(trips.id, tripId));

    const result = await runTripStalenessSweep(db);
    expect(result.reminded).toBeGreaterThanOrEqual(1);
    expect(result.autoCompleted).toBe(0);

    const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
    expect(trip!.status).toBe('active'); // untouched — GPS still live, only reminded
    expect(trip!.completionReminderSentAt).not.toBeNull();

    const riderNotif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, riderId), eq(notifications.type, 'trip_completion_reminder')),
      orderBy: (n, { desc }) => desc(n.createdAt),
    });
    expect(riderNotif).toBeDefined();

    // A second sweep pass, same overdue trip, doesn't re-send the reminder
    // — the sent-at timestamp stays exactly what the first pass set.
    await runTripStalenessSweep(db);
    const tripAfterSecondPass = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
    expect(tripAfterSecondPass!.completionReminderSentAt!.getTime()).toBe(
      trip!.completionReminderSentAt!.getTime(),
    );
  }, 20_000);

  it('the staleness sweep auto-completes a trip abandoned long enough with GPS gone quiet', async () => {
    const { tripId, bookingId, riderId } = await makeTripInFlight('4');

    // Well past TRIP_AUTO_CLOSE_GRACE_MS (3h) past a 1h estimate, and GPS
    // has been silent for well over TRIP_AUTO_CLOSE_STALE_LOCATION_MS (1h).
    await db
      .update(trips)
      .set({
        startedAt: new Date(Date.now() - (3600 + 4 * 3600) * 1000),
        locationUpdatedAt: new Date(Date.now() - 2 * 3600 * 1000),
      })
      .where(eq(trips.id, tripId));

    const result = await runTripStalenessSweep(db);
    expect(result.autoCompleted).toBeGreaterThanOrEqual(1);

    const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
    expect(trip!.status).toBe('completed');
    expect(trip!.completedAt).not.toBeNull();

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    expect(booking!.status).toBe('completed');

    const riderNotif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, riderId), eq(notifications.type, 'trip_completed')),
      orderBy: (n, { desc }) => desc(n.createdAt),
    });
    expect(riderNotif).toBeDefined();
  }, 20_000);
});
