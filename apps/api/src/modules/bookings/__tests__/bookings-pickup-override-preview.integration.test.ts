import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops } from '../../../db/schema/index.js';
import { getRoute } from '../../../lib/routing.js';
import { decodePolyline } from '../../../lib/polyline.js';
import { previewPickupOverride } from '../bookings.service.js';

/**
 * M-040/EDGE-053 (docs/unified_driver_and_passenger_journey.md §14, edge
 * 53): "Passenger can override to another VAYA-feasible point; VAYA
 * recalculates walk/PT/detour/ETA/feasibility and informs (not blocks)
 * when worse for driver." Exercises the real previewPickupOverride
 * function against real Postgres — the routing-engine half degrades
 * honestly (same `osrmUnavailable`-style pattern as
 * bookings-detour-booking.integration.test.ts) whenever this sandbox has
 * neither a reachable OSRM nor a configured Google routing key, since a
 * real (not fabricated) detour number requires one of those.
 */
describe('previewPickupOverride — M-040/EDGE-053', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideWithNoRouteId: string;
  let rideWithRouteId: string | null = null;
  let onRoutePoint: { lat: number; lng: number } | undefined;
  let routeIsLive = false;

  const tunis = { lat: 36.8065, lng: 10.1815 };
  const sousse = { lat: 35.8256, lng: 10.6369 };

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}5`, fullName: 'Pickup Override Preview Driver' })
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
        plateNumber: `OVRD-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    // Fixture A: a ride with NO route at all — deterministic, network-free
    // "can't compute feasibility" case (computeDetourImpact's own first
    // guard, before any routing call is even attempted).
    const [rideNoRoute] = await db
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
        contributionPerSeat: 12,
        status: 'draft',
        routePolyline: null,
      })
      .returning();
    rideWithNoRouteId = rideNoRoute!.id;

    // Fixture B: a ride WITH a real route — best-effort, degrades honestly
    // exactly like bookings-detour-booking.integration.test.ts.
    try {
      const route = await getRoute(tunis, sousse);
      if (!route.polyline) return;
      routeIsLive = true;
      const points = decodePolyline(route.polyline);
      onRoutePoint = points[Math.floor(points.length * 0.5)]!;

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
          contributionPerSeat: 12,
          status: 'published',
          routePolyline: route.polyline,
          estimatedDurationSec: route.durationSec,
        })
        .returning();
      rideWithRouteId = ride!.id;
    } catch {
      routeIsLive = false;
    }
  }, 60_000);

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.id, rideWithNoRouteId));
    if (rideWithRouteId) {
      await db.delete(routeStops).where(eq(routeStops.rideId, rideWithRouteId));
      await db.delete(rides).where(eq(rides.id, rideWithRouteId));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await closeDatabase();
  });

  it('never throws for a ride with no route yet — honestly reports feasibility as unknown, not fabricated', async () => {
    const preview = await previewPickupOverride(db, rideWithNoRouteId, { lat: 36.81, lng: 10.19 });
    expect(preview.withinAllowance).toBeNull();
    expect(preview.driverDetourExtraSeconds).toBeNull();
    expect(preview.driverDetourAllowanceSeconds).toBeNull();
  });

  it('computes a real walk distance from the passenger\'s own point to the override point when supplied', async () => {
    const overridePoint = { lat: 36.81, lng: 10.19 };
    const requestedPoint = { lat: 36.8105, lng: 10.1905 }; // a few tens of meters away
    const preview = await previewPickupOverride(db, rideWithNoRouteId, overridePoint, requestedPoint);
    expect(preview.walkMeters).not.toBeNull();
    expect(preview.walkMeters!).toBeGreaterThan(0);
    expect(preview.walkMeters!).toBeLessThan(200);
  });

  it('returns null walk distance when no requestedPoint is supplied — never fabricated', async () => {
    const preview = await previewPickupOverride(db, rideWithNoRouteId, { lat: 36.81, lng: 10.19 });
    expect(preview.walkMeters).toBeNull();
  });

  it('for a ride with a real route: recalculates a real driver-detour impact for the override point, never blocking regardless of the result', async () => {
    if (!routeIsLive || !rideWithRouteId || !onRoutePoint) return; // honest degradation, no live OSRM/Google in this sandbox.
    const preview = await previewPickupOverride(db, rideWithRouteId, onRoutePoint);
    // EDGE-053: the preview itself never throws/blocks — a genuinely
    // on-route point should come back well within allowance.
    expect(preview.withinAllowance).toBe(true);
    expect(preview.driverDetourExtraSeconds).not.toBeNull();
    expect(preview.driverDetourAllowanceSeconds).not.toBeNull();
    expect(preview.driverDetourExtraSeconds!).toBeLessThanOrEqual(preview.driverDetourAllowanceSeconds!);
  }, 30_000);

  it('for a ride with a real route: a far-off point still returns a preview (never throws), with withinAllowance: false', async () => {
    if (!routeIsLive || !rideWithRouteId || !onRoutePoint) return;
    // ~30km off the corridor — a real, large detour cost.
    const farPoint = { lat: onRoutePoint.lat + 0.3, lng: onRoutePoint.lng };
    const preview = await previewPickupOverride(db, rideWithRouteId, farPoint);
    expect(preview.withinAllowance).toBe(false);
    expect(preview.driverDetourExtraSeconds).not.toBeNull();
  }, 30_000);
});
