import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import {
  users,
  driverProfiles,
  vehicles,
  rides,
  trips,
  riderProfiles,
  ratings,
} from '../../../db/schema/index.js';
import { createBooking, acceptBooking } from '../../bookings/bookings.service.js';
import { completeTrip, getPendingRatingForUser, getTripByBookingId } from '../trips.service.js';
import { createRating, getTrustSummary } from '../../ratings/ratings.service.js';
import { ConflictError, ForbiddenError } from '../../../lib/errors.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * Full real-Postgres lifecycle for Phase 9
 * (docs/roadmap/phase-09-ratings-trust.md): trip completes -> both parties
 * become rating-eligible -> both submit -> aggregates recompute (driver_profiles
 * AND the new rider_profiles table) -> visible via getTrustSummary on the
 * other party's next lookup. Same real-DB discipline as Phase 7/8's
 * integration suites — the behavior under test (a live 24h-window check
 * against a real timestamp, a DB-unique-constraint-backed duplicate
 * rejection) only means something against a real Postgres instance.
 */
describe('trips + ratings — full lifecycle (Phase 9)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let riderId: string;
  let rideId: string;
  let secondRideId: string;

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'Rating Test Driver' })
      .returning();
    driverUserId = driverUser!.id;

    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId })
      .returning();
    driverProfileId = driverProfile!.id;

    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId,
        make: 'Test',
        model: 'Car',
        color: 'Blue',
        plateNumber: `RATE-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}2`, fullName: 'Rating Test Rider' })
      .returning();
    riderId = rider!.id;

    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Rate Origin',
        originLat: 36.8,
        originLng: 10.18,
        destinationLabel: 'Rate Dest',
        destinationLat: 36.85,
        destinationLng: 10.2,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    rideId = ride!.id;

    const [secondRide] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Rate Origin 2',
        originLat: 36.9,
        originLng: 10.28,
        destinationLabel: 'Rate Dest 2',
        destinationLat: 36.95,
        destinationLng: 10.3,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    secondRideId = secondRide!.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.driverProfileId, driverProfileId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(riderProfiles).where(eq(riderProfiles.userId, riderId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(users).where(eq(users.id, riderId));
    await closeQueue();
    await closeDatabase();
  });

  it('runs the full accept -> complete -> rate (both directions) -> aggregates -> trust-summary lifecycle', async () => {
    const booking = await createBooking(db, rideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Rate pickup', lat: 36.8, lng: 10.18 },
    });
    await acceptBooking(db, booking.id, driverUserId);

    const trip = await getTripByBookingId(db, booking.id, riderId);
    expect(trip.status).toBe('scheduled');

    // Neither party is a stranger to this trip — a third party can't reach it.
    const stranger = (
      await db.insert(users).values({ phone: `+216${Date.now() % 10_000_000}9`, fullName: 'Stranger' }).returning()
    )[0]!;
    await expect(completeTrip(db, trip.id, stranger.id)).rejects.toBeInstanceOf(ForbiddenError);
    await db.delete(users).where(eq(users.id, stranger.id));

    // The rider (not just the driver) can complete the trip — this
    // codebase has no driver-side trip-execution screen yet, so either
    // party must be able to trigger completion (trips.service.ts's doc
    // comment explains why).
    const completed = await completeTrip(db, trip.id, riderId);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).not.toBeNull();

    // Completing again is rejected, not silently re-applied.
    await expect(completeTrip(db, trip.id, riderId)).rejects.toBeInstanceOf(ConflictError);

    // Both directions can now rate.
    const riderRating = await createRating(db, trip.id, riderId, {
      role: 'rider_rates_driver',
      stars: 5,
      punctualityFlag: true,
      comment: 'Great driver',
    });
    expect(riderRating.rateeUserId).toBe(driverUserId);

    // Duplicate from the same rater on the same trip is rejected.
    await expect(
      createRating(db, trip.id, riderId, { role: 'rider_rates_driver', stars: 4 }),
    ).rejects.toBeInstanceOf(ConflictError);

    const driverRating = await createRating(db, trip.id, driverUserId, {
      role: 'driver_rates_rider',
      stars: 4,
      punctualityFlag: false,
    });
    expect(driverRating.rateeUserId).toBe(riderId);

    // Aggregates: driver_profiles.ratingAvg reflects the rider's 5-star
    // rating; the newly-created rider_profiles row reflects the driver's
    // 4-star rating.
    const driverProfile = await db.query.driverProfiles.findFirst({
      where: eq(driverProfiles.userId, driverUserId),
    });
    expect(driverProfile!.ratingAvg).toBeCloseTo(5, 5);
    expect(driverProfile!.punctualityScore).toBeCloseTo(1, 5);
    expect(driverProfile!.tripCount).toBeGreaterThanOrEqual(1);

    const riderProfile = await db.query.riderProfiles.findFirst({
      where: eq(riderProfiles.userId, riderId),
    });
    expect(riderProfile).toBeDefined();
    expect(riderProfile!.ratingAvg).toBeCloseTo(4, 5);
    expect(riderProfile!.punctualityScore).toBeCloseTo(0, 5);
    expect(riderProfile!.tripCount).toBeGreaterThanOrEqual(1);

    // Visible to the other party's next lookup, public-safe shape only.
    const driverTrustSeenByRider = await getTrustSummary(db, driverUserId);
    expect(driverTrustSeenByRider.driver?.ratingAvg).toBeCloseTo(5, 5);
    expect(driverTrustSeenByRider.driver?.tier).toBe('new'); // only 1 trip so far
    expect(driverTrustSeenByRider).not.toHaveProperty('comment');

    const riderTrustSeenByDriver = await getTrustSummary(db, riderId);
    expect(riderTrustSeenByDriver.rider?.ratingAvg).toBeCloseTo(4, 5);

    // Already rated by both — no pending prompt remains for either party.
    expect(await getPendingRatingForUser(db, riderId)).toBeNull();
    expect(await getPendingRatingForUser(db, driverUserId)).toBeNull();
  });

  it('rejects a rating submitted after the 24h window has expired', async () => {
    const booking = await createBooking(db, secondRideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Rate pickup 2', lat: 36.9, lng: 10.28 },
    });
    await acceptBooking(db, booking.id, driverUserId);
    const trip = await getTripByBookingId(db, booking.id, riderId);
    await completeTrip(db, trip.id, driverUserId);

    // Before rating, a prompt is pending for the rider.
    const pending = await getPendingRatingForUser(db, riderId);
    expect(pending?.tripId).toBe(trip.id);
    expect(pending?.role).toBe('rider_rates_driver');

    // Backdate completedAt past the 24h window, the way a real trip would
    // eventually age past it — same directness as
    // conversations.integration.test.ts's direct trips-table write.
    await db
      .update(trips)
      .set({ completedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(trips.id, trip.id));

    await expect(
      createRating(db, trip.id, riderId, { role: 'rider_rates_driver', stars: 5 }),
    ).rejects.toBeInstanceOf(ConflictError);

    // And the prompt is no longer surfaced once the window has lapsed.
    expect(await getPendingRatingForUser(db, riderId)).toBeNull();

    // No rating row was created by the rejected attempt.
    const rows = await db.query.ratings.findMany({ where: eq(ratings.tripId, trip.id) });
    expect(rows).toHaveLength(0);
  });
});
