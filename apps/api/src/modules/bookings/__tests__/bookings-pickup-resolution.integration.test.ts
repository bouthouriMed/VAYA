import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops, bookings } from '../../../db/schema/index.js';

/**
 * M-004/M-020 (docs/unified_driver_and_passenger_journey.md §5/§13, matrix
 * test ids `A.stops.corridor-intent-not-fixed-coordinate` /
 * `B.booking.pickup-resolved-not-passthrough`): "A selected stop is not a
 * fixed pickup coordinate... VAYA later determines the actual passenger
 * pickup/drop-off location." Before this pass, `POST /rides/:rideId/requests`
 * treated a client-supplied `pickupStopId` as a fully-trusted, opaque id —
 * zero distance validation against the passenger's own real point, and the
 * resolved walk distance was never persisted anywhere past the search
 * response that first computed it. Exercises the real HTTP layer
 * (`app.inject`), not a direct service-function call — this is also what
 * empirically proves `bookingResponseSchema` (bookings.routes.ts) actually
 * serializes the new fields (and the pre-existing, real dropoff-field-
 * stripping bug this pass also fixed) rather than silently dropping them.
 */
describe('POST /rides/:rideId/requests — M-004/M-020 real pickup/dropoff resolution', () => {
  let app: FastifyInstance;
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let riderUserId: string;
  let riderAccessToken: string;
  let rideId: string;
  let nearStopId: string;
  let farStopId: string;
  let dropoffStopId: string;

  const ORIGIN = { lat: 36.8, lng: 10.18 };
  const DESTINATION = { lat: 36.85, lng: 10.2 };
  // Well within a 'commute'-profile pickup radius (1000m — this ride has no
  // real routePolyline, so resolveStopWalkMeters falls back to the most
  // conservative classifyTripProfile(0) = 'commute' band) of NEAR_STOP.
  const REQUESTED_PICKUP = { label: 'Requested pickup', lat: 36.8005, lng: 10.1805 };
  const NEAR_STOP = { lat: 36.8, lng: 10.18 };
  // Tens of km from REQUESTED_PICKUP — a real stop on this ride, but nowhere
  // near where the rider actually says they are.
  const FAR_STOP = { lat: 37.0, lng: 10.4 };
  const REQUESTED_DROPOFF = { label: 'Requested dropoff', lat: 36.8505, lng: 10.2005 };
  const DROPOFF_STOP = { lat: 36.85, lng: 10.2 };

  beforeAll(async () => {
    app = await buildApp();
    const base = Math.floor(Math.random() * 1_000_000_000);

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'Resolution Test Driver' })
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
        color: 'Silver',
        plateNumber: `RESOLV-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    const [riderUser] = await db
      .insert(users)
      .values({ phone: `+216${base}2`, fullName: 'Resolution Test Rider' })
      .returning();
    riderUserId = riderUser!.id;
    riderAccessToken = app.jwt.sign({ sub: riderUserId });

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
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    rideId = ride!.id;

    const [nearStop] = await db
      .insert(routeStops)
      .values({
        rideId,
        sequence: 0,
        label: 'Near stop',
        lat: NEAR_STOP.lat,
        lng: NEAR_STOP.lng,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    nearStopId = nearStop!.id;

    const [farStop] = await db
      .insert(routeStops)
      .values({
        rideId,
        sequence: 1,
        label: 'Far stop',
        lat: FAR_STOP.lat,
        lng: FAR_STOP.lng,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    farStopId = farStop!.id;

    const [dropStop] = await db
      .insert(routeStops)
      .values({
        rideId,
        sequence: 2,
        label: 'Dropoff stop',
        lat: DROPOFF_STOP.lat,
        lng: DROPOFF_STOP.lng,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    dropoffStopId = dropStop!.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(bookings).where(eq(bookings.rideId, rideId));
    await db.delete(routeStops).where(eq(routeStops.rideId, rideId));
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(users).where(eq(users.id, riderUserId));
    await app.close();
    await closeDatabase();
  });

  it('resolves and persists a real walk distance, and the HTTP response actually carries it (not stripped)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/rides/${rideId}/requests`,
      headers: { authorization: `Bearer ${riderAccessToken}` },
      payload: {
        seatsRequested: 1,
        pickupStopId: nearStopId,
        requestedPickup: REQUESTED_PICKUP,
        dropoffStopId,
        requestedDropoff: REQUESTED_DROPOFF,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.pickupWalkMeters).not.toBeNull();
    expect(body.pickupWalkMeters).toBeGreaterThan(0);
    expect(body.pickupWalkMeters).toBeLessThan(200); // ~65m by construction, generous margin.
    expect(body.dropoffWalkMeters).not.toBeNull();
    // The real, pre-existing bug this pass also fixed: dropoff fields
    // existed on the DB row and were computed by createBooking, but
    // bookingResponseSchema never listed them, so Fastify's response
    // serializer silently stripped them from every booking payload.
    expect(body.dropoffStopId).toBe(dropoffStopId);
    expect(body.dropoffLabel).toBe('Dropoff stop');
    expect(body.dropoffLat).toBe(DROPOFF_STOP.lat);
    expect(body.dropoffLng).toBe(DROPOFF_STOP.lng);

    await db.delete(bookings).where(eq(bookings.id, body.id));
  });

  it('M-004: rejects a real stop id that is implausibly far from the passenger\'s own requested point — never blindly trusts the client\'s selection', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/rides/${rideId}/requests`,
      headers: { authorization: `Bearer ${riderAccessToken}` },
      payload: {
        seatsRequested: 1,
        pickupStopId: farStopId,
        requestedPickup: REQUESTED_PICKUP,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.message ?? body.error?.message).toMatch(/too far/i);

    const persisted = await db.query.bookings.findFirst({
      where: eq(bookings.rideId, rideId),
    });
    expect(persisted).toBeUndefined(); // Nothing was created.
  });

  it('stays backward compatible: a legacy client that omits requestedPickup keeps the pre-existing unconditional-acceptance behavior', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/rides/${rideId}/requests`,
      headers: { authorization: `Bearer ${riderAccessToken}` },
      payload: {
        seatsRequested: 1,
        pickupStopId: farStopId,
        // No requestedPickup at all.
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.pickupWalkMeters).toBeNull(); // Never fabricated.

    await db.delete(bookings).where(eq(bookings.id, body.id));
  });
});
