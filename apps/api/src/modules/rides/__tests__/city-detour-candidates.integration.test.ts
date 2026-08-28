import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides } from '../../../db/schema/index.js';
import { getRoute } from '../../../lib/routing.js';
import { listCityDetourCandidates, CITY_MERGE_RADIUS_M } from '../city-detour-candidates.service.js';
import { haversineDistanceMeters } from '../../../lib/geo.js';

/**
 * Exercises the real Postgres instance and real reverse-geocoding
 * provider (Nominatim in this environment — reachable over plain
 * outbound HTTPS, unlike the internal docker-composed OSRM instance,
 * which stays unreachable in this sandbox per every other integration
 * suite's own doc comments). getRoute itself degrades to a straight-line
 * haversine polyline when OSRM is unreachable (lib/routing.ts's own
 * documented fallback) — still real, decodable geometry this feature can
 * scan, so this test doesn't need to skip on OSRM's absence the way the
 * stop-candidates suites do.
 *
 * Assertions are deliberately loose (real coordinates, real non-empty
 * labels, no near-duplicates) rather than pinned to specific city names —
 * real-world OSM data can shift, and the point of this test is proving
 * the pipeline produces sane, real output end to end, not locking in
 * today's exact geocoding result for one route.
 */
describe('city-detour-candidates.service — real Postgres + real geocoding provider', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;

  // Real Tunis -> Sousse intercity corridor (~140km), same fixture used by
  // matching-tiers.integration.test.ts's route_passthrough case — long
  // enough to plausibly pass through at least one real named city.
  const origin = { lat: 36.8065, lng: 10.1815 };
  const destination = { lat: 35.8256, lng: 10.6369 };

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}5`, fullName: 'City Detour Test Driver' })
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
        color: 'Grey',
        plateNumber: `CITY-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    const route = await getRoute(origin, destination);

    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Tunis',
        originLat: origin.lat,
        originLng: origin.lng,
        destinationLabel: 'Sousse',
        destinationLat: destination.lat,
        destinationLng: destination.lng,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 12,
        status: 'draft',
        routePolyline: route.polyline || null,
        estimatedDurationSec: route.durationSec,
      })
      .returning();
    rideId = ride!.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await closeDatabase();
  });

  it(
    'returns real, distinct, sanely-located city candidates along a real intercity route',
    async () => {
      const result = await listCityDetourCandidates(db, rideId, driverUserId);

      expect(['commute', 'urban', 'intercity']).toContain(result.tripProfileType);
      // Not just structural sanity on an empty list — this ~140km real
      // corridor genuinely passes real towns (Hammamet, Bouficha, etc.),
      // confirmed live while building this. An empty result here would
      // mean the discovery pipeline silently stopped finding anything.
      expect(result.cities.length).toBeGreaterThan(0);

      for (const city of result.cities) {
        expect(city.label.length).toBeGreaterThan(0);
        // Real coordinates, roughly within Tunisia's bounding box.
        expect(city.lat).toBeGreaterThan(30);
        expect(city.lat).toBeLessThan(38);
        expect(city.lng).toBeGreaterThan(7);
        expect(city.lng).toBeLessThan(12);
      }

      // No two returned candidates should be near-duplicates of each other
      // (dedupeCities' own job, verified end to end here).
      for (let i = 0; i < result.cities.length; i++) {
        for (let j = i + 1; j < result.cities.length; j++) {
          const a = result.cities[i]!;
          const b = result.cities[j]!;
          expect(a.label === b.label || haversineDistanceMeters(a, b) <= CITY_MERGE_RADIUS_M).toBe(false);
        }
      }
    },
    45_000,
  );

  it('is cached: a second call for the same route returns the same result without erroring', async () => {
    const first = await listCityDetourCandidates(db, rideId, driverUserId);
    const second = await listCityDetourCandidates(db, rideId, driverUserId);
    expect(second.cities).toEqual(first.cities);
    expect(second.tripProfileType).toBe(first.tripProfileType);
  }, 30_000);
});
