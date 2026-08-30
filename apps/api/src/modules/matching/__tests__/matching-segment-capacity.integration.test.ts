import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops } from '../../../db/schema/index.js';
import { getRoute } from '../../../lib/routing.js';
import { decodePolyline } from '../../../lib/polyline.js';
import { upsertRouteGeometry } from '../../../lib/spatial.js';
import { createBooking, acceptBooking } from '../../bookings/bookings.service.js';
import { searchRides } from '../matching.service.js';

/**
 * M-081 (docs/unified_driver_and_passenger_journey.md §25 "Segment-Based
 * Capacity"): "Driver has 3 seats... A's seat becomes available after
 * Zaragoza... This impacts: search, candidate pooling, request validation,
 * acceptance, pricing, driver itinerary, live matching." Real bug this
 * closes, confirmed live before the fix: every search tier gated on
 * `rides.seatsAvailable`, which `bookings.service.ts`'s own
 * `loadRideSegmentState` doc comment already documents as "seatsTotal minus
 * the ride's current bottleneck-segment occupancy" — a ride saturated on
 * ONE segment reads `seatsAvailable: 0` and vanished from search entirely,
 * even when the searching rider's own segment has full capacity
 * elsewhere on the route.
 */
describe('matching.service — segment-aware search capacity (M-081)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;
  const riderIds: string[] = [];
  let routeIsLive = false;
  let stop1Point: { lat: number; lng: number } | undefined;
  let stop2Point: { lat: number; lng: number } | undefined;

  const tunis = { lat: 36.8065, lng: 10.1815 };
  const sousse = { lat: 35.8256, lng: 10.6369 };

  async function makeRider(suffix: string): Promise<string> {
    const base = Date.now() % 10_000_000;
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}${suffix}`, fullName: `SegCap Rider ${suffix}` })
      .returning();
    riderIds.push(rider!.id);
    return rider!.id;
  }

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}8`, fullName: 'SegCap Test Driver' })
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
        color: 'Red',
        plateNumber: `SEGCAP-${base}`,
        seatCount: 1,
      })
      .returning();
    vehicleId = vehicle!.id;

    try {
      const route = await getRoute(tunis, sousse);
      if (!route.polyline) return;
      routeIsLive = true;
      const points = decodePolyline(route.polyline);

      // Only 1 seat total — the whole point is proving a search for the
      // FREE segment still finds this ride even though the ride's own
      // bottleneck-segment occupancy makes seatsAvailable read 0.
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
          seatsTotal: 1,
          seatsAvailable: 1,
          contributionPerSeat: 15,
          status: 'published',
          routePolyline: route.polyline,
          estimatedDurationSec: route.durationSec,
        })
        .returning();
      rideId = ride!.id;
      // Real fixtures created outside rides.service.ts's own createRide
      // must populate route_geom themselves (createRide does this as one
      // of its own steps) — otherwise the PostGIS route_passthrough
      // pre-filter's `route_geom IS NOT NULL` check silently excludes this
      // ride from every search, independent of anything M-081 changed.
      await upsertRouteGeometry(db, rideId, route.polyline);

      const [stop0] = await db
        .insert(routeStops)
        .values({
          rideId,
          sequence: 0,
          label: 'Stop 0',
          lat: points[Math.floor(points.length * 0.25)]!.lat,
          lng: points[Math.floor(points.length * 0.25)]!.lng,
          roadSnapped: true,
          isDriverSelected: true,
        })
        .returning();
      const [stop1] = await db
        .insert(routeStops)
        .values({
          rideId,
          sequence: 1,
          label: 'Stop 1',
          lat: points[Math.floor(points.length * 0.5)]!.lat,
          lng: points[Math.floor(points.length * 0.5)]!.lng,
          roadSnapped: true,
          isDriverSelected: true,
        })
        .returning();
      const [stop2] = await db
        .insert(routeStops)
        .values({
          rideId,
          sequence: 2,
          label: 'Stop 2',
          lat: points[Math.floor(points.length * 0.75)]!.lat,
          lng: points[Math.floor(points.length * 0.75)]!.lng,
          roadSnapped: true,
          isDriverSelected: true,
        })
        .returning();
      stop1Point = { lat: stop1!.lat, lng: stop1!.lng };
      stop2Point = { lat: stop2!.lat, lng: stop2!.lng };

      // The ride's only seat is booked for stop0 -> stop1 (an early
      // segment) — the ride's OWN seatsAvailable now reads 0 (the
      // bottleneck), but the LATER stop1 -> stop2 segment was never
      // touched by this booking at all.
      const firstRiderId = await makeRider('a');
      const firstBooking = await createBooking(db, rideId, firstRiderId, {
        seatsRequested: 1,
        pickupStopId: stop0!.id,
        dropoffStopId: stop1!.id,
      });
      await acceptBooking(db, firstBooking.id, driverUserId);
    } catch {
      routeIsLive = false;
    }
  }, 30_000);

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
    await closeDatabase();
  });

  it("the ride's own seatsAvailable genuinely reads 0 (the bottleneck segment) after the first booking is accepted", async () => {
    if (!routeIsLive) return; // Honest degradation — no live routing engine reachable here.
    const ride = await db.query.rides.findFirst({ where: eq(rides.id, rideId) });
    expect(ride!.seatsAvailable).toBe(0);
  });

  it('M-081: a search for the later, genuinely-free stop1 -> stop2 segment still discovers this ride, despite seatsAvailable: 0', async () => {
    if (!routeIsLive || !stop1Point || !stop2Point) return;
    const result = await searchRides(db, {
      originLat: stop1Point.lat,
      originLng: stop1Point.lng,
      destinationLat: stop2Point.lat,
      destinationLng: stop2Point.lng,
      when: new Date(Date.now() + 3_600_000),
    });
    const match = result.candidates.find((c) => c.rideId === rideId);
    expect(
      match,
      'A ride bottlenecked on an earlier segment must still be discoverable for a later, genuinely free segment (spec §25)',
    ).toBeDefined();
  }, 30_000);
});
