import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, bookings } from '../../../db/schema/index.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * What a passenger learns before and after a driver accepts them:
 * - the plate is never in the public profile, and GET /bookings/:id/vehicle
 *   only answers the booking's two parties once it's accepted;
 * - a request can carry one message, and until acceptance the passenger
 *   writes again only after the driver replies.
 */
describe('Booking privacy and pre-acceptance messaging (HTTP)', () => {
  let app: FastifyInstance;
  const db = getDatabase();
  let driverUserId: string;
  let riderUserId: string;
  let strangerUserId: string;
  let driverToken: string;
  let riderToken: string;
  let strangerToken: string;
  let rideId: string;
  let bookingId: string;
  let conversationId: string;
  const plate = `${(Date.now() % 900) + 100} TU ${Date.now() % 10_000}`;

  const as = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await buildApp();
    const base = Date.now() % 10_000_000;
    const mk = async (name: string) =>
      (await db.insert(users).values({ authProvider: 'google', email: `bp-${name}-${base}@vaya.tn`, fullName: name }).returning())[0]!.id;
    driverUserId = await mk('Privacy Driver');
    riderUserId = await mk('Privacy Rider');
    strangerUserId = await mk('Privacy Stranger');
    driverToken = app.jwt.sign({ sub: driverUserId });
    riderToken = app.jwt.sign({ sub: riderUserId });
    strangerToken = app.jwt.sign({ sub: strangerUserId });

    const [profile] = await db.insert(driverProfiles).values({ userId: driverUserId, verificationStatus: 'approved' }).returning();
    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId: profile!.id, make: 'Peugeot', model: '208', color: 'Gris', plateNumber: plate, seatCount: 4 })
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
  }, 60_000);

  afterAll(async () => {
    await db.delete(bookings).where(eq(bookings.rideId, rideId));
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(users).where(inArray(users.id, [driverUserId, riderUserId, strangerUserId]));
    await app.close();
    await closeQueue();
    await closeDatabase();
  });

  it('never puts the plate in the public profile', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/users/${driverUserId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().driver.vehicle).toMatchObject({ make: 'Peugeot', model: '208', color: 'Gris' });
    expect(res.body).not.toContain(plate);
  });

  it('opens the conversation with the message sent along with the request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/rides/${rideId}/requests`,
      headers: as(riderToken),
      payload: { seatsRequested: 1, pickup: { label: 'Pickup', lat: 36.7992, lng: 10.1811 }, message: "J'ai une valise, ça passe ?" },
    });
    expect(res.statusCode).toBe(200);
    bookingId = res.json().id;

    const conv = await app.inject({ method: 'GET', url: `/api/v1/conversations/${bookingId}`, headers: as(riderToken) });
    expect(conv.statusCode).toBe(200);
    conversationId = conv.json().id;
    expect(conv.json().lastMessage.body).toBe("J'ai une valise, ça passe ?");
    expect(conv.json().composer).toBe('awaiting_reply');
  });

  it("refuses the passenger's second message until the driver replies, then gives the turn back", async () => {
    const send = (token: string, body: string) =>
      app.inject({ method: 'POST', url: `/api/v1/conversations/${conversationId}/messages`, headers: as(token), payload: { body } });

    const second = await send(riderToken, 'Vous êtes là ?');
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('AWAITING_DRIVER_REPLY');

    expect((await send(driverToken, 'Oui, pas de souci.')).statusCode).toBe(200);
    expect((await send(riderToken, 'Merci !')).statusCode).toBe(200);
  });

  it('keeps the plate private while the request is pending', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/bookings/${bookingId}/vehicle`, headers: as(riderToken) });
    expect(res.statusCode).toBe(403);
  });

  it('shares the plate with the accepted passenger only', async () => {
    const accept = await app.inject({ method: 'POST', url: `/api/v1/bookings/${bookingId}/accept`, headers: as(driverToken) });
    expect(accept.statusCode).toBe(200);

    const rider = await app.inject({ method: 'GET', url: `/api/v1/bookings/${bookingId}/vehicle`, headers: as(riderToken) });
    expect(rider.statusCode).toBe(200);
    expect(rider.json().plateNumber).toBe(plate);

    const stranger = await app.inject({ method: 'GET', url: `/api/v1/bookings/${bookingId}/vehicle`, headers: as(strangerToken) });
    expect(stranger.statusCode).toBe(403);
  });
});
