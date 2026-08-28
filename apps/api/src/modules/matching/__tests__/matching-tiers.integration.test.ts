import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops } from '../../../db/schema/index.js';
import { getRoute } from '../../../lib/routing.js';
import { decodePolyline } from '../../../lib/polyline.js';
import { upsertRouteGeometry } from '../../../lib/spatial.js';
import { searchRides } from '../matching.service.js';

/**
 * Exercises the real Postgres instance and, for the route-passthrough
 * fixture, the real docker-composed OSRM instance (same discipline as
 * stop-candidates.integration.test.ts) — proves the Phase 13 tier cascade
 * (docs/roadmap/phase-13-search-engine.md) actually returns each of its
 * tiers end-to-end, not just that the pure per-tier functions compile.
 *
 * Four widely-separated geographic clusters keep each tier's fixture from
 * accidentally satisfying a different tier's search:
 *  - "Area A" (a Tunis suburb): an exact-match ride and a far-future ride
 *    on the same corridor (closest_departure).
 *  - "Area B" (~a hundred km southwest, inland): a ride only reachable by
 *    widening the radius (wide_corridor).
 *  - The real Tunis→Sousse coastal route: a long ride with two real
 *    mid-route stops, searched by a short sub-trip entirely inside it
 *    (route_passthrough).
 *  - A remote southern-Tunisia desert point with nothing anywhere near it
 *    (the genuine "none" case).
 */
describe('matching.service — tier cascade, real Postgres (+ real OSRM for route_passthrough)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  const rideIds: string[] = [];
  const stopIds: string[] = [];

  const now = new Date();
  const areaAWhen = new Date(now.getTime() + 3_600_000); // Ride A departs in 1h.
  // Search 3 days out — outside Ride A's exact/wide window entirely, so the
  // closest_departure fixture (also in Area A) can't be shadowed by it.
  const closestDepartureSearchWhen = new Date(now.getTime() + 3 * 24 * 3_600_000);
  const closestDepartureRideWhen = new Date(closestDepartureSearchWhen.getTime() + 10 * 3_600_000);

  const areaAOrigin = { lat: 36.75, lng: 10.2 };
  const areaADestination = { lat: 36.78, lng: 10.23 };

  // The rider's OWN requested origin/destination must itself be a >15km
  // ("urban"-profile) trip so this fixture keeps testing the flat
  // pre-Phase-A wide radii (8km/10km) it was written for — matching-engine
  // architecture plan §G profile-scales the wide radius down for a short
  // ("commute"-profile) request, which a ~4km rider trip (the original
  // fixture's own distance) would now trigger. ~28.6km apart, safely inside
  // "urban" (≤45km).
  const areaBRiderOrigin = { lat: 36.3, lng: 9.5 };
  const areaBRiderDestination = { lat: 36.5, lng: 9.7 };
  // ~4km/~5km offsets from the rider's own points — clearly inside the
  // urban-profile WIDE radii (8km/10km) and outside TIGHT (2km/3km), not a
  // borderline value that could flake.
  const areaBRideOrigin = { lat: 36.336, lng: 9.5 }; // ~4km north of rider origin.
  const areaBRideDestination = { lat: 36.545, lng: 9.7 }; // ~5km north of rider destination.

  const tunis = { lat: 36.8065, lng: 10.1815 };
  const sousse = { lat: 35.8256, lng: 10.6369 };

  const desertOrigin = { lat: 24.0, lng: 9.0 };
  const desertDestination = { lat: 24.05, lng: 9.05 };

  // Phase A of the matching-engine architecture plan ("trip-profile-aware
  // matching thresholds"): a short (~2.9km, "commute"-profile) rider trip,
  // geographically isolated from every other fixture above, with a ride
  // placed ~5.6km away — inside the OLD flat wide radius (8km) but outside
  // the NEW commute-scaled wide radius (4km). Proves the narrowing actually
  // takes effect end-to-end, not just in the pure-function unit tests.
  const commuteRiderOrigin = { lat: 33.0, lng: 10.0 };
  const commuteRiderDestination = { lat: 33.02, lng: 10.02 }; // ~2.9km from origin.
  const commuteFarRideOrigin = { lat: 33.05, lng: 10.0 }; // ~5.6km north of rider origin.
  const commuteFarRideDestination = { lat: 33.07, lng: 10.02 }; // ~5.6km north of rider destination.

  let passThroughRideId: string | undefined;
  let passThroughPickup: { lat: number; lng: number } | undefined;
  let passThroughDropoff: { lat: number; lng: number } | undefined;
  let osrmUnavailable = false;

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'Matching Tiers Test Driver' })
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
        plateNumber: `TIER-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    async function insertRide(values: Partial<typeof rides.$inferInsert>) {
      const [ride] = await db
        .insert(rides)
        .values({
          driverProfileId,
          vehicleId,
          seatsTotal: 4,
          seatsAvailable: 4,
          contributionPerSeat: 10,
          status: 'published',
          ...values,
        } as typeof rides.$inferInsert)
        .returning();
      rideIds.push(ride!.id);
      // Mirrors rides.service.ts's createRide, which real ride creation goes
      // through — a raw insert() here (unlike the production path) never
      // populates route_geom on its own, and route_passthrough's PostGIS
      // stage-1 filter (findCandidateRideIdsByCorridor) requires it non-null.
      if (values.routePolyline) {
        await upsertRouteGeometry(db, ride!.id, values.routePolyline);
      }
      return ride!.id;
    }

    // Ride A — exact match: endpoints identical to the search point, tight time.
    await insertRide({
      originLabel: 'Area A Origin',
      originLat: areaAOrigin.lat,
      originLng: areaAOrigin.lng,
      destinationLabel: 'Area A Destination',
      destinationLat: areaADestination.lat,
      destinationLng: areaADestination.lng,
      departureAt: areaAWhen,
    });

    // Ride D — closest-departure fixture: same endpoints as Area A, but far
    // outside any exact/wide time window relative to closestDepartureSearchWhen.
    await insertRide({
      originLabel: 'Area A Origin (future)',
      originLat: areaAOrigin.lat,
      originLng: areaAOrigin.lng,
      destinationLabel: 'Area A Destination (future)',
      destinationLat: areaADestination.lat,
      destinationLng: areaADestination.lng,
      departureAt: closestDepartureRideWhen,
    });

    // Ride B — wide-corridor-only: endpoints outside TIGHT, inside WIDE
    // (urban-profile radii, since the rider trip searching for it is >15km).
    await insertRide({
      originLabel: 'Area B Ride Origin',
      originLat: areaBRideOrigin.lat,
      originLng: areaBRideOrigin.lng,
      destinationLabel: 'Area B Ride Destination',
      destinationLat: areaBRideDestination.lat,
      destinationLng: areaBRideDestination.lng,
      departureAt: areaAWhen,
    });

    // Ride E — Phase A regression guard: inside the OLD flat wide radius,
    // outside the NEW commute-scaled wide radius. Must NOT be found by a
    // short rider trip searched from commuteRiderOrigin/Destination.
    await insertRide({
      originLabel: 'Commute Far Ride Origin',
      originLat: commuteFarRideOrigin.lat,
      originLng: commuteFarRideOrigin.lng,
      destinationLabel: 'Commute Far Ride Destination',
      destinationLat: commuteFarRideDestination.lat,
      destinationLng: commuteFarRideDestination.lng,
      departureAt: areaAWhen,
    });

    // Ride C — route-passthrough: a real long OSRM route with two real
    // mid-route stops, searched by a short sub-trip fully inside it.
    try {
      const route = await getRoute(tunis, sousse);
      if (route.polyline) {
        const points = decodePolyline(route.polyline);
        const pickupIdx = Math.floor(points.length * 0.25);
        const dropoffIdx = Math.floor(points.length * 0.6);
        passThroughPickup = points[pickupIdx]!;
        passThroughDropoff = points[dropoffIdx]!;

        passThroughRideId = await insertRide({
          originLabel: 'Tunis',
          originLat: tunis.lat,
          originLng: tunis.lng,
          destinationLabel: 'Sousse',
          destinationLat: sousse.lat,
          destinationLng: sousse.lng,
          departureAt: areaAWhen,
          routePolyline: route.polyline,
          estimatedDurationSec: route.durationSec,
        });

        const [pickupStop] = await db
          .insert(routeStops)
          .values({
            rideId: passThroughRideId,
            sequence: 0,
            label: 'Mid-route pickup',
            lat: passThroughPickup.lat,
            lng: passThroughPickup.lng,
            roadSnapped: true,
            isDriverSelected: true,
          })
          .returning();
        stopIds.push(pickupStop!.id);

        const [dropoffStop] = await db
          .insert(routeStops)
          .values({
            rideId: passThroughRideId,
            sequence: 1,
            label: 'Mid-route dropoff',
            lat: passThroughDropoff.lat,
            lng: passThroughDropoff.lng,
            roadSnapped: true,
            isDriverSelected: true,
          })
          .returning();
        stopIds.push(dropoffStop!.id);
      } else {
        osrmUnavailable = true;
      }
    } catch {
      osrmUnavailable = true;
    }
  }, 60_000);

  afterAll(async () => {
    for (const stopId of stopIds) {
      await db.delete(routeStops).where(eq(routeStops.id, stopId));
    }
    for (const rideId of rideIds) {
      await db.delete(rides).where(eq(rides.id, rideId));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await closeDatabase();
  });

  it('returns tier "exact" when a ride matches origin/destination/time tightly', async () => {
    const result = await searchRides(db, {
      originLat: areaAOrigin.lat,
      originLng: areaAOrigin.lng,
      destinationLat: areaADestination.lat,
      destinationLng: areaADestination.lng,
      when: areaAWhen,
    });
    expect(result.tier).toBe('exact');
    expect(result.message).toBeNull();
    expect(result.candidates.some((c) => c.matchType === 'endpoint')).toBe(true);
  });

  it('falls back to tier "wide_corridor" when only a wider radius finds a ride', async () => {
    const result = await searchRides(db, {
      originLat: areaBRiderOrigin.lat,
      originLng: areaBRiderOrigin.lng,
      destinationLat: areaBRiderDestination.lat,
      destinationLng: areaBRiderDestination.lng,
      when: areaAWhen,
    });
    expect(result.tier).toBe('wide_corridor');
    expect(result.message).toBeTruthy();
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  // Matching-engine architecture plan §G / §A — "trip-profile-aware
  // matching thresholds" (Phase A). The ride fixture above sits ~5.6km
  // from the rider's own short (~2.9km) requested trip: comfortably inside
  // the OLD flat wide radius (8km) this same rider point would have hit
  // pre-Phase-A, but outside the NEW commute-scaled wide radius (4km) a
  // short trip now gets. If this ever regresses back to 'wide_corridor',
  // the profile-scaling has silently stopped applying.
  it('does NOT surface a ride inside the old flat wide radius but outside the new commute-scaled wide radius, for a short requested trip', async () => {
    const result = await searchRides(db, {
      originLat: commuteRiderOrigin.lat,
      originLng: commuteRiderOrigin.lng,
      destinationLat: commuteRiderDestination.lat,
      destinationLng: commuteRiderDestination.lng,
      when: areaAWhen,
    });
    expect(result.tier).toBe('none');
    expect(result.candidates).toEqual([]);
  });

  it('falls back to tier "route_passthrough" for a rider whose sub-trip lies on a long ride\'s real route', async () => {
    if (osrmUnavailable || !passThroughPickup || !passThroughDropoff) {
      // Honest degradation, same discipline as stop-candidates.integration.test.ts —
      // this environment's OSRM wasn't reachable, nothing further to assert.
      return;
    }
    const result = await searchRides(db, {
      originLat: passThroughPickup.lat,
      originLng: passThroughPickup.lng,
      destinationLat: passThroughDropoff.lat,
      destinationLng: passThroughDropoff.lng,
      when: areaAWhen,
    });
    expect(result.tier).toBe('route_passthrough');
    const match = result.candidates.find((c) => c.rideId === passThroughRideId);
    expect(match).toBeDefined();
    expect(match!.matchType).toBe('route_passthrough');
    expect(match!.pickupViable).toBe(true);
    expect(match!.dropoffViable).toBe(true);
    expect(match!.rankedStops.length).toBeGreaterThan(0);
    expect(match!.rankedDropoffStops.length).toBeGreaterThan(0);
  }, 30_000);

  it('still finds a route_passthrough ride when the search points sit near a real stop but far from the route line itself (regression: city-center geocode offset)', async () => {
    if (osrmUnavailable || !passThroughPickup || !passThroughDropoff) {
      // Honest degradation, same discipline as stop-candidates.integration.test.ts —
      // this environment's OSRM wasn't reachable, nothing further to assert.
      return;
    }
    // Reproduces the real reported bug: a rider searches from a city-center
    // geocode (e.g. "Zaragoza") that can sit hundreds of meters to a few km
    // from the route's actual road line, even though a real driver-placed
    // stop nearby is genuinely walkable. The old code gated candidates on
    // distance from the search point to the route LINE itself
    // (corridorWidthM, ~150-250m) — far stricter than, and independent of,
    // the separate stop-walkability check that runs afterward. Offsetting
    // by ~450m (well outside the old line-distance gate, well inside the
    // wide/stop-walkability radius) must still surface the ride.
    const offsetDeg = 0.004; // ~350-450m at these latitudes.
    const offsetOrigin = { lat: passThroughPickup.lat + offsetDeg, lng: passThroughPickup.lng };
    const offsetDestination = { lat: passThroughDropoff.lat + offsetDeg, lng: passThroughDropoff.lng };
    const result = await searchRides(db, {
      originLat: offsetOrigin.lat,
      originLng: offsetOrigin.lng,
      destinationLat: offsetDestination.lat,
      destinationLng: offsetDestination.lng,
      when: areaAWhen,
    });
    const match = result.candidates.find((c) => c.rideId === passThroughRideId);
    expect(match).toBeDefined();
    expect(match!.matchType).toBe('route_passthrough');
    expect(match!.pickupViable).toBe(true);
    expect(match!.dropoffViable).toBe(true);
  }, 30_000);

  it('falls back to tier "detour_match" (not "none") for a rider whose points sit ON a real route but no driver-selected stop exists there (regression: a real point on-route was silently unmatched by every tier)', async () => {
    if (osrmUnavailable || !passThroughPickup || !passThroughDropoff) {
      // Honest degradation, same discipline as the other OSRM-dependent
      // fixtures in this file.
      return;
    }
    // Real bug found live: a rider searching Guadalajara -> Madrid, both
    // genuinely on a driver's real route, got zero results — route_
    // passthrough correctly excludes it (no real driver-selected stop
    // exists at that specific spot, per its own "never offer an
    // unvalidated pickup" design), but scoreDetourCandidates ALSO used to
    // skip it (a pure "is this geometrically on the corridor" check,
    // wrongly assuming route_passthrough already covers every on-route
    // point regardless of stops), so nothing ever surfaced it. Reuses the
    // route-passthrough fixture's own long real route, but picks two
    // points well away from BOTH of its real stops (fractions 0.25/0.6) so
    // neither tier's stop-walkability check can accidentally pass.
    const route = await getRoute(tunis, sousse);
    const points = decodePolyline(route.polyline);
    const onRouteOrigin = points[Math.floor(points.length * 0.05)]!;
    const onRouteDestination = points[Math.floor(points.length * 0.12)]!;

    const result = await searchRides(db, {
      originLat: onRouteOrigin.lat,
      originLng: onRouteOrigin.lng,
      destinationLat: onRouteDestination.lat,
      destinationLng: onRouteDestination.lng,
      when: areaAWhen,
    });

    expect(result.tier).toBe('detour_match');
    const match = result.candidates.find((c) => c.rideId === passThroughRideId);
    expect(match).toBeDefined();
    expect(match!.matchType).toBe('detour');
    // A genuinely on-route insertion costs the driver almost nothing extra.
    expect(match!.detour!.extraDurationSeconds).toBeLessThan(5 * 60);
  }, 30_000);

  it('falls back to tier "closest_departure" when nothing matches at or near the requested time', async () => {
    const result = await searchRides(db, {
      originLat: areaAOrigin.lat,
      originLng: areaAOrigin.lng,
      destinationLat: areaADestination.lat,
      destinationLng: areaADestination.lng,
      when: closestDepartureSearchWhen,
    });
    expect(result.tier).toBe('closest_departure');
    expect(result.message).toBeTruthy();
    expect(result.candidates.length).toBeGreaterThan(0);
    // Never a past departure — the lookahead window starts at "now", not at
    // the (future) requested time, so an earlier-than-requested but still
    // upcoming departure is a legitimate closer match (Ride A, departing
    // sooner than Ride D, sorts first by time-proximity to `when` only if
    // it's actually closer — here Ride D is the intentionally-closest one).
    expect(result.candidates.every((c) => c.departureAt.getTime() >= now.getTime())).toBe(true);
    const sortedByTimeDelta = [...result.candidates].sort(
      (a, b) =>
        Math.abs(a.departureAt.getTime() - closestDepartureSearchWhen.getTime()) -
        Math.abs(b.departureAt.getTime() - closestDepartureSearchWhen.getTime()),
    );
    expect(result.candidates[0]!.rideId).toBe(sortedByTimeDelta[0]!.rideId);
  });

  it('returns tier "none" with zero candidates when nothing matches on any tier', async () => {
    const result = await searchRides(db, {
      originLat: desertOrigin.lat,
      originLng: desertOrigin.lng,
      destinationLat: desertDestination.lat,
      destinationLng: desertDestination.lng,
      when: now,
    });
    expect(result.tier).toBe('none');
    expect(result.candidates).toEqual([]);
    expect(result.message).toBeNull();
  });
});
