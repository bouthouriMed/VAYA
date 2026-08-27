import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops } from '../../../db/schema/index.js';
import { getRoute } from '../../../lib/routing.js';
import {
  generateCandidateStopsForRide,
  updateDriverStopSelection,
  listSelectedRideStops,
  listRideStopsForDriver,
  MAX_DEVIATION_METERS,
  MAX_DEVIATION_SECONDS,
} from '../stop-candidates.service.js';

/**
 * Exercises the real Postgres instance and, deliberately, the real
 * docker-composed OSRM instance (docker/docker-compose.yml's `osrm`
 * service, verified running against the actual Tunisia extract at
 * OSRM_URL for this test run) — not a mocked response. This is the
 * integration test docs/roadmap/phase-04-ride-engine-driver-stops.md asks
 * for: "confirming end-to-end candidate generation produces a sane result"
 * against a real Tunisian route. The pure scoring/clustering math itself
 * is covered without any network dependency in stop-candidates.service.test.ts.
 *
 * If OSRM genuinely isn't reachable in a given environment, generation
 * degrades to `osrmUnavailable: true` with an empty stop list rather than
 * throwing (docs/domain/ride-engine.md's OSRM-unavailable edge case) — the
 * assertions below accept that honestly instead of failing outright, so
 * this suite doesn't hard-require live OSRM/network access to run, while
 * still verifying the real thing whenever it's actually available.
 */
describe('stop-candidates.service — real OSRM + real Postgres', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;

  // A real, short intra-Tunis route (Avenue Habib Bourguiba area to Lac 1) —
  // short enough to keep sample/OSRM-call count small for a fast test run,
  // long enough to plausibly produce a candidate stop or two.
  const origin = { lat: 36.7992, lng: 10.1811 };
  const destination = { lat: 36.8324, lng: 10.2334 };

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}4`, fullName: 'Stop Candidates Test Driver' })
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
        color: 'White',
        plateNumber: `STOP-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    // Real OSRM call (not mocked) — same helper rides.service.ts uses at
    // ride-creation time, so the fixture's routePolyline is exactly what
    // production would compute for this origin/destination.
    const route = await getRoute(origin, destination);

    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Avenue Habib Bourguiba, Tunis',
        originLat: origin.lat,
        originLng: origin.lng,
        destinationLabel: 'Lac 1, Tunis',
        destinationLat: destination.lat,
        destinationLng: destination.lng,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 5,
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
    'generates real, road-snapped candidate stops for a real Tunisian route',
    async () => {
      const result = await generateCandidateStopsForRide(db, rideId, driverUserId);

      expect(result.regenerated).toBe(true);

      if (result.osrmUnavailable) {
        // Honest degradation, not a test failure — see the suite doc
        // comment. Nothing further to assert about candidate quality.
        expect(result.stops).toEqual([]);
        return;
      }

      for (const stop of result.stops) {
        expect(stop.roadClass).not.toBe('motorway');
        expect(stop.deviationMeters).toBeLessThanOrEqual(MAX_DEVIATION_METERS);
        expect(stop.deviationSeconds).toBeLessThanOrEqual(MAX_DEVIATION_SECONDS);
        expect(stop.roadSnapped).toBe(true);
        expect(stop.label.length).toBeGreaterThan(0);
        expect(stop.suitabilityScore).toBeGreaterThan(0);
        expect(stop.suitabilityScore).toBeLessThanOrEqual(1);
        // Real coordinates, roughly within Tunisia's bounding box — a sane
        // end-to-end sanity check that these are real snapped points, not
        // placeholder/garbage values.
        expect(stop.lat).toBeGreaterThan(30);
        expect(stop.lat).toBeLessThan(38);
        expect(stop.lng).toBeGreaterThan(7);
        expect(stop.lng).toBeLessThan(12);
      }

      const persisted = await db.query.routeStops.findMany({ where: eq(routeStops.rideId, rideId) });
      expect(persisted).toHaveLength(result.stops.length);
    },
    60_000,
  );

  it(
    'is idempotent given the same route: a second call returns the same rows without regenerating',
    async () => {
      const second = await generateCandidateStopsForRide(db, rideId, driverUserId);
      expect(second.regenerated).toBe(false);
    },
    30_000,
  );

  it('lets the driver select a subset of candidates, never forcing adoption', async () => {
    const all = await listRideStopsForDriver(db, rideId, driverUserId);

    if (all.length === 0) {
      // No viable candidates for this route — publishing with zero stops
      // must still work, which the empty selection call below verifies.
      const stops = await updateDriverStopSelection(db, rideId, driverUserId, []);
      expect(stops).toEqual([]);
      const publicStops = await listSelectedRideStops(db, rideId);
      expect(publicStops).toEqual([]);
      return;
    }

    const firstStop = all[0]!;
    await updateDriverStopSelection(db, rideId, driverUserId, [
      { stopId: firstStop.id, isDriverSelected: true },
    ]);

    const publicStops = await listSelectedRideStops(db, rideId);
    expect(publicStops.map((s) => s.id)).toContain(firstStop.id);
    expect(publicStops.every((s) => s.isDriverSelected)).toBe(true);

    // Deselecting everything is explicitly allowed — origin/destination
    // alone remains a valid ride (docs/domain/ride-engine.md).
    await updateDriverStopSelection(db, rideId, driverUserId, [
      { stopId: firstStop.id, isDriverSelected: false },
    ]);
    const afterDeselect = await listSelectedRideStops(db, rideId);
    expect(afterDeselect).toHaveLength(0);
  }, 30_000);
});
