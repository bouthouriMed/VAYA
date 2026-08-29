import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import {
  operationalConfigs,
  adminUsers,
  users,
  driverProfiles,
  vehicles,
  rides,
  routeStops,
} from '../../../db/schema/index.js';
import {
  getActiveOperationalConfig,
  updateOperationalConfig,
  DEFAULT_RESOLVED_OPERATIONAL_CONFIG,
} from '../operational-config.service.js';
import { cancelBooking, createBooking } from '../../bookings/bookings.service.js';
import { getRoute } from '../../../lib/routing.js';
import { decodePolyline } from '../../../lib/polyline.js';

/**
 * Journey-contract second pass (docs/unified_driver_and_passenger_journey.md
 * §28, M-085/M-086) — real Postgres. Proves the full chain end-to-end: no
 * admin row -> pure domain defaults; an admin update -> a real persisted
 * row; and, critically, that a real downstream consumer (cancelBooking)
 * actually reads the updated value rather than the module's own hardcoded
 * constant — the exact gap M-085 originally found ("pattern exists for
 * pricing_configs, never extended to matching/detour thresholds").
 */
describe('operational-config.service — VAYA operational policy configuration (M-085/M-086)', () => {
  const db = getDatabase();
  let adminUserId: string | undefined;

  afterEach(async () => {
    // Every test starts from "no active row" — deletes rather than
    // deactivates, so DEFAULT_RESOLVED_OPERATIONAL_CONFIG's fallback is
    // exercised fresh by the next test too.
    await db.delete(operationalConfigs).where(eq(operationalConfigs.scope, 'national'));
  });

  afterAll(async () => {
    if (adminUserId) await db.delete(adminUsers).where(eq(adminUsers.id, adminUserId));
    await closeDatabase();
  });

  async function makeAdmin(): Promise<string> {
    const base = Date.now() % 10_000_000;
    const [admin] = await db
      .insert(adminUsers)
      .values({
        email: `opconfig-admin-${base}@vaya-test.local`,
        passwordHash: 'not-a-real-hash',
        fullName: 'Op Config Test Admin',
        role: 'admin',
      })
      .returning();
    adminUserId = admin!.id;
    return admin!.id;
  }

  it('falls back to @vaya/domain pure defaults for every threshold when no admin row exists', async () => {
    const resolved = await getActiveOperationalConfig(db);
    expect(resolved).toEqual(DEFAULT_RESOLVED_OPERATIONAL_CONFIG);
  });

  it('an admin update persists and is reflected on the next read, leaving un-updated fields at their default', async () => {
    const admin = await makeAdmin();
    const resolved = await updateOperationalConfig(db, { cancellationFreeWindowHours: 48 }, admin);

    expect(resolved.cancellationFreeWindowHours).toBe(48);
    // Every other field is untouched — still its pure default.
    expect(resolved.noShowMinMinutesAfterDeparture).toBe(
      DEFAULT_RESOLVED_OPERATIONAL_CONFIG.noShowMinMinutesAfterDeparture,
    );

    const reread = await getActiveOperationalConfig(db);
    expect(reread.cancellationFreeWindowHours).toBe(48);
  });

  it('a later partial update only changes the fields supplied, preserving an earlier admin override', async () => {
    const admin = await makeAdmin();
    await updateOperationalConfig(db, { cancellationFreeWindowHours: 48 }, admin);
    const resolved = await updateOperationalConfig(db, { noShowMinMinutesAfterDeparture: 20 }, admin);

    expect(resolved.cancellationFreeWindowHours).toBe(48); // earlier override survives
    expect(resolved.noShowMinMinutesAfterDeparture).toBe(20);
  });

  it('rejects a negative/non-finite override rather than persisting nonsense', async () => {
    const admin = await makeAdmin();
    await expect(updateOperationalConfig(db, { cancellationFreeWindowHours: -5 }, admin)).rejects.toThrow();
  });

  it('a real downstream consumer (cancelBooking) actually reads the admin-configured value, not the hardcoded default', async () => {
    const admin = await makeAdmin();
    // Departure is 20h out — under the DEFAULT 24h free-window, cancelling
    // now (20h < 24h before departure) is 'moderate'. Overriding the
    // free-window down to 10h flips the SAME cancellation instant to
    // 'free' (20h >= 10h) — an unambiguous behavioral change that could
    // only happen if cancelBooking actually reads the configured value,
    // not the hardcoded CANCELLATION_FREE_WINDOW_HOURS constant.
    await updateOperationalConfig(db, { cancellationFreeWindowHours: 10 }, admin);

    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}oc1`, fullName: 'OpConfig Driver' })
      .returning();
    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUser!.id, verificationStatus: 'approved' })
      .returning();
    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId: driverProfile!.id,
        make: 'Test',
        model: 'Car',
        color: 'Black',
        plateNumber: `OC-${base}`,
        seatCount: 4,
      })
      .returning();
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId: driverProfile!.id,
        vehicleId: vehicle!.id,
        originLabel: 'Tunis',
        originLat: 36.8065,
        originLng: 10.1815,
        destinationLabel: 'Sousse',
        destinationLat: 35.8256,
        destinationLng: 10.6369,
        departureAt: new Date(Date.now() + 20 * 60 * 60_000), // 20h out
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 15,
        status: 'published',
      })
      .returning();
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}oc2`, fullName: 'OpConfig Rider' })
      .returning();

    try {
      const booking = await createBooking(db, ride!.id, rider!.id, {
        seatsRequested: 1,
        pickup: { label: 'Tunis', lat: 36.8065, lng: 10.1815 },
      });
      const { cancellationPolicy } = await cancelBooking(db, booking.id, rider!.id, 'change_of_plans');
      // Under the DEFAULT 24h free-window this would be 'moderate'
      // (20h < 24h before departure). The configured 10h override flips it
      // to 'free' (20h >= 10h) — proof cancelBooking read the admin value.
      expect(cancellationPolicy.tier).toBe('free');
    } finally {
      await db.delete(rides).where(eq(rides.id, ride!.id));
      await db.delete(vehicles).where(eq(vehicles.id, vehicle!.id));
      await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfile!.id));
      await db.delete(users).where(eq(users.id, driverUser!.id));
      await db.delete(users).where(eq(users.id, rider!.id));
    }
  }, 20_000);

  // M-085/M-085a (spec §28): "maximum driver detour... admin-configurable".
  // Real bug this closes: matching.service.ts's detour_match tier and
  // bookings.service.ts's assertRealDetourWithinAllowance/computeDetourImpact
  // both used to read MAX_DETOUR_RATIO as a bare hardcoded module constant,
  // with no way for an admin override to ever reach them — confirmed live
  // by grep before this fix (zero callers of getActiveOperationalConfig
  // anywhere in matching.service.ts). Exercises the real, live routing
  // engine (Google Routes when a server key is configured, this session's
  // real infrastructure) — degrades honestly, same discipline as
  // bookings-detour-booking.integration.test.ts, when it isn't.
  it('a real downstream consumer (createBooking\'s free-form-detour check) actually reads the admin-configured maxDetourRatio, not the hardcoded default', async () => {
    const tunis = { lat: 36.8065, lng: 10.1815 };
    const sousse = { lat: 35.8256, lng: 10.6369 };
    let route;
    try {
      route = await getRoute(tunis, sousse);
    } catch {
      return; // Honest degradation — no live routing engine reachable here.
    }
    if (!route.polyline) return; // Same degradation, the fallback-route case.

    const points = decodePolyline(route.polyline);
    // A real mid-route point, genuinely on the route (near-zero detour cost
    // under the DEFAULT ratio) but far enough off the exact line that an
    // artificially tiny ratio override rejects it — real detour geometry,
    // not a fabricated distance.
    const onRoutePoint = { lat: points[Math.floor(points.length * 0.5)]!.lat + 0.01, lng: points[Math.floor(points.length * 0.5)]!.lng };

    const admin = await makeAdmin();
    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}oc3`, fullName: 'OpConfig Detour Driver' })
      .returning();
    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUser!.id, verificationStatus: 'approved' })
      .returning();
    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId: driverProfile!.id,
        make: 'Test',
        model: 'Car',
        color: 'White',
        plateNumber: `OCD-${base}`,
        seatCount: 4,
      })
      .returning();
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId: driverProfile!.id,
        vehicleId: vehicle!.id,
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
    // One real stop — a ride with zero stops takes the ungated legacy
    // free-form path instead, which wouldn't exercise this check at all.
    const [stop] = await db
      .insert(routeStops)
      .values({
        rideId: ride!.id,
        sequence: 0,
        label: 'Real mid-route stop',
        lat: points[Math.floor(points.length * 0.1)]!.lat,
        lng: points[Math.floor(points.length * 0.1)]!.lng,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}oc4`, fullName: 'OpConfig Detour Rider' })
      .returning();

    try {
      // An artificially tiny ratio (0.1% of baseline duration) — the same
      // real point that's normally an accepted, near-zero-cost detour under
      // the default ratio must now be rejected, proving the admin override
      // actually reached the live check.
      await updateOperationalConfig(db, { maxDetourRatio: 0.001 }, admin);
      await expect(
        createBooking(db, ride!.id, rider!.id, {
          seatsRequested: 1,
          pickupStopId: stop!.id,
          dropoff: { label: 'Real on-route dropoff', lat: onRoutePoint.lat, lng: onRoutePoint.lng },
        }),
      ).rejects.toThrow();
    } finally {
      await db.delete(routeStops).where(eq(routeStops.rideId, ride!.id));
      await db.delete(rides).where(eq(rides.id, ride!.id));
      await db.delete(vehicles).where(eq(vehicles.id, vehicle!.id));
      await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfile!.id));
      await db.delete(users).where(eq(users.id, driverUser!.id));
      await db.delete(users).where(eq(users.id, rider!.id));
    }
  }, 30_000);
});
