import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides } from '../../../db/schema/index.js';

/**
 * Exercises the real Postgres instance (and real OSRM, same discipline as
 * stop-candidates.integration.test.ts) through the actual HTTP layer
 * (`app.inject`, not a direct service-function call) — this is
 * deliberately "a direct API call bypassing the UI," per
 * docs/roadmap/phase-06-pricing-engine.md's business rule: "a direct API
 * call with an out-of-bounds price must still be rejected." A client-side
 * bounded slider (packages/design-system's PriceRangeStepper) can make an
 * out-of-bounds value hard to produce from the app UI, but that's a UX
 * convenience — this suite proves the server rejects it independent of
 * that entirely.
 */
describe('POST/PATCH /rides — Phase 6 pricing bound enforcement', () => {
  let app: FastifyInstance;
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let accessToken: string;

  // A real, short intra-Tunis route — same corridor style as
  // stop-candidates.integration.test.ts, short enough for a fast OSRM call.
  const origin = { label: 'Avenue Habib Bourguiba, Tunis', lat: 36.7992, lng: 10.1811 };
  const destination = { label: 'Lac 1, Tunis', lat: 36.8324, lng: 10.2334 };

  beforeAll(async () => {
    app = await buildApp();
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}9`, fullName: 'Pricing Test Driver' })
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
        plateNumber: `PRICE-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    accessToken = app.jwt.sign({ sub: driverUserId });
  }, 30_000);

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.driverProfileId, driverProfileId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await app.close();
    await closeDatabase();
  });

  it('creates a ride with a real computed pricing suggestion when no price is supplied', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        vehicleId,
        origin,
        destination,
        departureAt: new Date(Date.now() + 3_600_000).toISOString(),
        seatsTotal: 3,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.pricing).toBeDefined();
    expect(body.pricing.min).toBeLessThanOrEqual(body.pricing.recommended);
    expect(body.pricing.max).toBeGreaterThanOrEqual(body.pricing.recommended);
    // Defaulted to the recommended suggestion, not an arbitrary/absent value.
    expect(body.contributionPerSeat).toBe(body.pricing.recommended);

    await db.delete(rides).where(eq(rides.id, body.id));
  });

  it('rejects an out-of-bounds contributionPerSeat on ride creation with a clear 400, independent of any client-side clamping', async () => {
    // First, learn this route's real bound via a valid create call (no
    // price supplied), exactly like a real client would before adjusting.
    const probe = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        vehicleId,
        origin,
        destination,
        departureAt: new Date(Date.now() + 3_600_000).toISOString(),
        seatsTotal: 3,
      },
    });
    const { pricing, id: probeRideId } = probe.json();
    await db.delete(rides).where(eq(rides.id, probeRideId));

    // Simulate a direct API call — as if bypassing any UI slider entirely —
    // sending a price far above the computed max.
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        vehicleId,
        origin,
        destination,
        departureAt: new Date(Date.now() + 3_600_000).toISOString(),
        seatsTotal: 3,
        contributionPerSeat: pricing.max + 1000,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    // A clear, specific message — not generic Zod validation noise.
    expect(body.message ?? body.error?.message).toMatch(/between/i);
  });

  it('rejects an out-of-bounds price on PATCH /rides/:rideId too, and accepts one inside the bound', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        vehicleId,
        origin,
        destination,
        departureAt: new Date(Date.now() + 3_600_000).toISOString(),
        seatsTotal: 3,
      },
    });
    const ride = created.json();

    const badPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/rides/${ride.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { contributionPerSeat: ride.pricing.min - 1000 },
    });
    expect(badPatch.statusCode).toBe(400);

    const goodValue = Math.round(((ride.pricing.min + ride.pricing.max) / 2) * 2) / 2;
    const goodPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/rides/${ride.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { contributionPerSeat: goodValue },
    });
    expect(goodPatch.statusCode).toBe(200);
    expect(goodPatch.json().contributionPerSeat).toBe(goodValue);

    await db.delete(rides).where(eq(rides.id, ride.id));
  });
});
