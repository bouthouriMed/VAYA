import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, bookings } from '../../../db/schema/index.js';
import { createBooking, acceptBooking } from '../../bookings/bookings.service.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * No SMS provider is live, so OTP can't attach a phone. A user can instead
 * type a contact number (PATCH /users/me { contactPhone }) — no OTP — and
 * the matched counterpart of an accepted booking gets it from the
 * contact-phone endpoint. It never becomes the login phone. Real Postgres.
 */
describe('Self-declared contact phone (HTTP)', () => {
  let app: FastifyInstance;
  const db = getDatabase();
  let driverUserId: string;
  let riderUserId: string;
  let riderToken: string;
  let driverToken: string;
  let rideId: string;
  let bookingId: string;

  beforeAll(async () => {
    app = await buildApp();
    const base = Date.now() % 10_000_000;
    // Google-style accounts: no verified phone at all.
    const [driver] = await db
      .insert(users)
      .values({
        authProvider: 'google',
        email: `cp-driver-${base}@vaya.tn`,
        fullName: 'Contact Driver',
      })
      .returning();
    driverUserId = driver!.id;
    driverToken = app.jwt.sign({ sub: driverUserId });
    const [rider] = await db
      .insert(users)
      .values({
        authProvider: 'google',
        email: `cp-rider-${base}@vaya.tn`,
        fullName: 'Contact Rider',
      })
      .returning();
    riderUserId = rider!.id;
    riderToken = app.jwt.sign({ sub: riderUserId });

    const [profile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId: profile!.id,
        make: 'Test',
        model: 'Car',
        color: 'Bleu',
        plateNumber: `CP-${base}`,
        seatCount: 4,
      })
      .returning();
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId: profile!.id,
        vehicleId: vehicle!.id,
        originLabel: 'Tunis',
        originLat: 36.7992,
        originLng: 10.1811,
        destinationLabel: 'Ariana',
        destinationLat: 36.8624,
        destinationLng: 10.1934,
        departureAt: new Date(Date.now() + 24 * 3_600_000),
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    rideId = ride!.id;
    const booking = await createBooking(db, rideId, riderUserId, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: 36.7992, lng: 10.1811 },
    });
    bookingId = booking.id;
    await acceptBooking(db, bookingId, driverUserId);
  }, 60_000);

  afterAll(async () => {
    await db.delete(bookings).where(eq(bookings.rideId, rideId));
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(users).where(inArray(users.id, [driverUserId, riderUserId]));
    await app.close();
    await closeQueue();
    await closeDatabase();
  });

  it('saves a contact number without any OTP, and leaves the login phone untouched', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${driverToken}` },
      payload: { contactPhone: '+21622123456' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().contactPhone).toBe('+21622123456');
    expect(res.json().phone).toBeNull();
  });

  it('rejects a malformed number', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${driverToken}` },
      payload: { contactPhone: '12345' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('gives the accepted counterpart the contact number', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/bookings/${bookingId}/contact-phone`,
      headers: { authorization: `Bearer ${riderToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().phone).toBe('+21622123456');
  });

  it('prefers a verified login phone over the contact number', async () => {
    await db.update(users).set({ phone: '+21698765432' }).where(eq(users.id, driverUserId));
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/bookings/${bookingId}/contact-phone`,
      headers: { authorization: `Bearer ${riderToken}` },
    });
    expect(res.json().phone).toBe('+21698765432');
  });
});
