import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import {
  users,
  driverProfiles,
  vehicles,
  rides,
  riderProfiles,
  notifications,
} from '../../../db/schema/index.js';
import { createBooking, acceptBooking } from '../../bookings/bookings.service.js';
import { completeTrip, getTripByBookingId } from '../../trips/trips.service.js';
import { createRating } from '../ratings.service.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * Real-Postgres proof (same discipline as bookings-notifications.integration.test.ts
 * for Phase 7) that submitting a rating creates a `rating_received`
 * notification row for the ratee — the hook this session added to
 * ratings.service.ts's createRating, which notifications/email-templates.ts's
 * renderRatingReceived then turns into an email for whichever party was
 * just rated (docs/domain/notifications.md's email-dispatch extension).
 */
describe('ratings.service -> notifications dispatch (rating_received)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let riderId: string;
  let rideId: string;

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}5`, fullName: 'RatingNotif Driver' })
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
        plateNumber: `RATN-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}6`, fullName: 'RatingNotif Rider' })
      .returning();
    riderId = rider!.id;

    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'RatingNotif Origin',
        originLat: 36.8,
        originLng: 10.18,
        destinationLabel: 'RatingNotif Dest',
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

  it('creates a rating_received notification row for the ratee, carrying rater name/stars/comment', async () => {
    const booking = await createBooking(db, rideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'RatingNotif pickup', lat: 36.8, lng: 10.18 },
    });
    await acceptBooking(db, booking.id, driverUserId);
    const trip = await getTripByBookingId(db, booking.id, riderId);
    await completeTrip(db, trip.id, riderId);

    await createRating(db, trip.id, riderId, {
      role: 'rider_rates_driver',
      stars: 5,
      comment: 'Excellent trajet',
    });

    const notification = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, driverUserId), eq(notifications.type, 'rating_received')),
    });
    expect(notification).toBeDefined();
    const payload = notification!.payload as Record<string, unknown>;
    expect(payload.raterName).toBe('RatingNotif Rider');
    expect(payload.stars).toBe(5);
    expect(payload.comment).toBe('Excellent trajet');
  });
});
