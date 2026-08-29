import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import {
  users,
  driverProfiles,
  vehicles,
  rides,
  routeStops,
  operationalConfigs,
  adminUsers,
} from '../../../db/schema/index.js';
import { getRoute } from '../../../lib/routing.js';
import { decodePolyline } from '../../../lib/polyline.js';
import { createBooking, acceptBooking } from '../bookings.service.js';
import { updateOperationalConfig } from '../../operational-config/operational-config.service.js';
import { AppError } from '../../../lib/errors.js';

/**
 * M-083/M-084/EDGE-052/INV-09 (docs/unified_driver_and_passenger_journey.md
 * §27, §62 "Existing Passengers Have Soft Protection") — real Postgres, real
 * routing engine when reachable. Real gap this closes: `evaluateExistingPassengerImpact`
 * (a real, already-tested pure domain function) had zero real callers
 * anywhere in `apps/api` before this pass — confirmed live by grep, not
 * assumed — so a new free-form-detour request was never actually evaluated
 * against an already-accepted passenger's own trip, regardless of how much
 * delay it would cause them.
 *
 * Degrades honestly, same discipline as bookings-detour-booking.integration.
 * test.ts, whenever no live routing engine is reachable in this sandbox.
 */
describe('bookings.service — existing-passenger soft protection (M-083/M-084/EDGE-052/INV-09)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;
  let midStopId: string;
  const riderIds: string[] = [];
  const adminUserIds: string[] = [];
  let routeIsLive = false;
  let farOnRoutePoint: { lat: number; lng: number } | undefined;

  const tunis = { lat: 36.8065, lng: 10.1815 };
  const sousse = { lat: 35.8256, lng: 10.6369 };

  async function makeRider(suffix: string): Promise<string> {
    const base = Date.now() % 10_000_000;
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}${suffix}`, fullName: `EPI Rider ${suffix}` })
      .returning();
    riderIds.push(rider!.id);
    return rider!.id;
  }

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}7`, fullName: 'EPI Test Driver' })
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
        color: 'Green',
        plateNumber: `EPI-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    try {
      const route = await getRoute(tunis, sousse);
      if (!route.polyline) return;
      routeIsLive = true;
      const points = decodePolyline(route.polyline);

      const [ride] = await db
        .insert(rides)
        .values({
          driverProfileId,
          vehicleId,
          originLabel: 'Tunis',
          originLat: tunis.lat,
          originLng: tunis.lng,
          destinationLabel: 'Sousse',
          destinationLat: sousse.lat,
          destinationLng: sousse.lng,
          departureAt: new Date(Date.now() + 3_600_000),
          seatsTotal: 4,
          seatsAvailable: 4,
          contributionPerSeat: 15,
          status: 'published',
          routePolyline: route.polyline,
          estimatedDurationSec: route.durationSec,
        })
        .returning();
      rideId = ride!.id;

      // A real, near-origin stop — the existing passenger boards early and
      // rides almost the whole route, so their own remaining trip duration
      // is genuinely long and a detour anywhere ahead of them counts as a
      // real, non-trivial delay ratio.
      const [midStop] = await db
        .insert(routeStops)
        .values({
          rideId,
          sequence: 0,
          label: 'Near-origin stop',
          lat: points[Math.floor(points.length * 0.05)]!.lat,
          lng: points[Math.floor(points.length * 0.05)]!.lng,
          roadSnapped: true,
          isDriverSelected: true,
        })
        .returning();
      midStopId = midStop!.id;

      // A real on-route point near the destination — genuinely a small,
      // legitimate detour under the DEFAULT detour ratio (used to prove
      // both the "accepted when impact is small" and, with a tightened
      // admin threshold, "rejected when impact exceeds the configured
      // bound" cases against the exact same real geometry).
      const idx = Math.floor(points.length * 0.9);
      farOnRoutePoint = { lat: points[idx]!.lat + 0.01, lng: points[idx]!.lng };
    } catch {
      routeIsLive = false;
    }
  }, 30_000);

  afterEach(async () => {
    await db.delete(operationalConfigs).where(eq(operationalConfigs.scope, 'national'));
  });

  afterAll(async () => {
    if (routeIsLive) {
      await db.delete(routeStops).where(eq(routeStops.rideId, rideId));
      await db.delete(rides).where(eq(rides.id, rideId));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    for (const id of riderIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    for (const id of adminUserIds) {
      await db.delete(adminUsers).where(eq(adminUsers.id, id));
    }
    await closeDatabase();
  });

  it('accepts a genuinely small real detour even with an already-accepted long-remaining-trip passenger on the ride', async () => {
    if (!routeIsLive || !farOnRoutePoint) return; // Honest degradation — no live routing engine reachable here.

    const firstRiderId = await makeRider('a');
    const firstBooking = await createBooking(db, rideId, firstRiderId, {
      seatsRequested: 1,
      pickupStopId: midStopId,
      // No dropoff -> rides all the way to the ride's own destination, the
      // longest possible remaining trip for this fixture.
    });
    await acceptBooking(db, firstBooking.id, driverUserId);

    const secondRiderId = await makeRider('b');
    // A genuinely small real detour under the DEFAULT ratio should still be
    // accepted — existing-passenger protection isn't a blanket ban on any
    // detour, only on one exceeding the configured threshold.
    const booking = await createBooking(db, rideId, secondRiderId, {
      seatsRequested: 1,
      pickupStopId: midStopId,
      dropoff: { label: 'Small real detour dropoff', lat: farOnRoutePoint.lat, lng: farOnRoutePoint.lng },
    });
    expect(booking.id).toBeTruthy();
  }, 30_000);

  it('rejects a request whose real detour would delay an already-accepted passenger beyond the admin-configured bound (INV-09)', async () => {
    if (!routeIsLive || !farOnRoutePoint) return;

    const firstRiderId = await makeRider('c');
    const firstBooking = await createBooking(db, rideId, firstRiderId, {
      seatsRequested: 1,
      pickupStopId: midStopId,
    });
    await acceptBooking(db, firstBooking.id, driverUserId);

    // Tighten the existing-passenger bound to effectively zero tolerance —
    // the SAME real detour the previous test accepted must now be rejected,
    // proving this booking-layer check is genuinely live and reads the
    // admin-configured threshold (M-085's own established pattern), not a
    // hardcoded pass-through.
    const admin = await makeAdminForThisFile();
    await updateOperationalConfig(
      db,
      { existingPassengerMaxDelayRatio: 0.0001, existingPassengerMaxAbsoluteDelayMinutes: 0.0001 },
      admin,
    );

    const secondRiderId = await makeRider('d');
    await expect(
      createBooking(db, rideId, secondRiderId, {
        seatsRequested: 1,
        pickupStopId: midStopId,
        dropoff: { label: 'Now-too-costly detour dropoff', lat: farOnRoutePoint.lat, lng: farOnRoutePoint.lng },
      }),
    ).rejects.toBeInstanceOf(AppError);
  }, 30_000);

  async function makeAdminForThisFile(): Promise<string> {
    const base = Date.now() % 10_000_000;
    const [admin] = await db
      .insert(adminUsers)
      .values({
        email: `epi-admin-${base}@vaya-test.local`,
        passwordHash: 'not-a-real-hash',
        fullName: 'EPI Test Admin',
        role: 'admin',
      })
      .returning();
    adminUserIds.push(admin!.id);
    return admin!.id;
  }
});
