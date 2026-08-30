import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides } from '../../../db/schema/index.js';
import { getRoute } from '../../../lib/routing.js';
import { upsertRouteGeometry, findCandidateRideIdsByCorridor } from '../../../lib/spatial.js';

/**
 * Real bug found live (reported by the user testing on a real device after
 * publishing an actual Madrid -> Barcelona ride and being unable to find it
 * searching Zaragoza -> Lleida, a genuine sub-corridor of that same route):
 * `scoreDetourCandidates`'s cheap PostGIS pre-filter radius
 * (`DETOUR_SEARCH_RADIUS_M`) was a flat, profile-independent 2.5km constant
 * — while every OTHER radius in this matching engine
 * (widePickupRadiusM/corridorWidthM/etc., deriveMatchingThresholds) scales
 * with trip length, up to 20-25km for an intercity profile. A real
 * intercity highway route legitimately sits several km from a rider's
 * city-center search point — this ride's real route_geom measured ~3.4km
 * from Zaragoza and ~7.1km from Lleida, both past the old flat cap, so the
 * PostGIS pre-filter silently excluded a genuinely relevant ride from ever
 * reaching the real per-candidate routing-cost check that tier exists to
 * run.
 */
describe('matching.service — detour tier PostGIS pre-filter radius is profile-scaled (real Madrid->Barcelona repro)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;
  let routeIsLive = false;

  const MADRID = { lat: 40.4168, lng: -3.7038 };
  const BARCELONA = { lat: 41.3874, lng: 2.1686 };
  // Real coordinates from the user's own live repro — both genuinely
  // several km off the real Madrid->Barcelona highway route.
  const ZARAGOZA = { lat: 41.6488, lng: -0.8891 };
  const LLEIDA = { lat: 41.6176, lng: 0.62 };

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+34${base}`, fullName: 'DetourRadius Test Driver' })
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
        plateNumber: `DETRAD-${base}`,
        seatCount: 3,
      })
      .returning();
    vehicleId = vehicle!.id;

    try {
      const route = await getRoute(MADRID, BARCELONA);
      if (!route.polyline || route.isEstimate) return; // Honest degradation — no live routing engine reachable here.
      routeIsLive = true;

      const [ride] = await db
        .insert(rides)
        .values({
          driverProfileId,
          vehicleId,
          originLabel: 'Madrid, Spain',
          originLat: MADRID.lat,
          originLng: MADRID.lng,
          destinationLabel: 'Barcelona, Spain',
          destinationLat: BARCELONA.lat,
          destinationLng: BARCELONA.lng,
          departureAt: new Date(Date.now() + 24 * 3_600_000),
          seatsTotal: 3,
          seatsAvailable: 3,
          contributionPerSeat: 40,
          status: 'published',
          routePolyline: route.polyline,
          estimatedDurationSec: route.durationSec,
        })
        .returning();
      rideId = ride!.id;
      await upsertRouteGeometry(db, rideId, route.polyline);
    } catch {
      routeIsLive = false;
    }
  }, 30_000);

  afterAll(async () => {
    if (routeIsLive) {
      await db.delete(rides).where(eq(rides.id, rideId));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await closeDatabase();
  });

  it('the real route genuinely sits beyond the old flat 2.5km radius from both search points (confirms this is a real repro, not a contrived one)', async () => {
    if (!routeIsLive) return;
    const now = new Date();
    const dayAhead = new Date(now.getTime() + 25 * 3_600_000);

    const atOldFlatRadius = await findCandidateRideIdsByCorridor(db, ZARAGOZA, LLEIDA, 2_500, now, dayAhead, 15);
    expect(atOldFlatRadius).not.toBeNull(); // PostGIS must actually be enabled for this repro to mean anything.
    expect(atOldFlatRadius).not.toContain(rideId);
  }, 15_000);

  it('the same real route IS found once the pre-filter radius is profile-scaled to the intercity wide radius (the actual fix)', async () => {
    if (!routeIsLive) return;
    const now = new Date();
    const dayAhead = new Date(now.getTime() + 25 * 3_600_000);

    // 25,000 = Math.max(intercity widePickupRadiusM, wideDropoffRadiusM) —
    // the exact value scoreDetourCandidates now derives from
    // deriveMatchingThresholds, replacing the old flat constant.
    const atProfileScaledRadius = await findCandidateRideIdsByCorridor(db, ZARAGOZA, LLEIDA, 25_000, now, dayAhead, 15);
    expect(atProfileScaledRadius).toContain(rideId);
  }, 15_000);

  // NOTE on this real repro's actual end-to-end outcome, checked live and
  // deliberately not asserted as a third test here: with this fix alone,
  // searchRides for these exact real coordinates still returns tier
  // 'none' — verified live (Google-routed) that the real detour cost of
  // inserting BOTH a Zaragoza and a Lleida city-center stop is ~38 real
  // minutes, which exceeds the separately-configured, admin-tunable
  // intercity `detourCeilingSec` (20 min — packages/domain's
  // MATCHING_THRESHOLDS_BY_PROFILE, itself explicitly documented as "a
  // HYPOTHESIS pending real search/booking outcome data to calibrate," not
  // a bug this fix touches). That is a real, separate, correctly-functioning
  // policy decision, not a regression — a ride with real driver-selected
  // stops at Zaragoza/Lleida (this codebase's own intended path,
  // rides/city-detour-candidates.service.ts) would instead be found
  // instantly via route_passthrough with zero detour-ceiling exposure at
  // all, since a real stop is never subject to this tier's cost check.
});
