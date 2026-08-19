import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import {
  users,
  driverProfiles,
  vehicles,
  rides,
  recurringPatterns,
  notifications,
  recurringDetectionConfigs,
} from '../../../db/schema/index.js';
import {
  runRecurringPatternDetectionScan,
  updateRecurringPatternStatus,
  checkProactiveMatchesForEnabledRiderPatterns,
} from '../recurring.service.js';
import { createRide, publishRide } from '../../rides/rides.service.js';
import { getNotificationDispatchQueue, closeQueue } from '../../../lib/queue.js';

const JOB_STATUSES = ['waiting', 'delayed', 'active', 'completed', 'failed'] as const;

// A real, short intra-Tunis corridor — same coordinates style as
// rides-pricing.integration.test.ts, so the one real OSRM call this suite
// makes (inside createRide) resolves quickly.
const ORIGIN = { label: 'Avenue Habib Bourguiba, Tunis', lat: 36.7992, lng: 10.1811 };
const DESTINATION = { label: 'Lac 1, Tunis', lat: 36.8324, lng: 10.2334 };

// Deterministic detection thresholds for this suite — installed as the
// sole active `recurring_detection_configs` row for the test's duration
// (any pre-existing active row(s) are deactivated and restored afterwards)
// so results never depend on whatever happens to be seeded.
const TEST_CONFIG = {
  minTripCount: 3,
  fullConfidenceTripCount: 5,
  lookbackDays: 60,
  corridorRadiusMeters: 1200,
  timeWindowMinutes: 60,
  suggestedConfidenceThreshold: 0.6,
  dismissalRequiredConfidenceDelta: 0.15,
};

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

/**
 * Real-Postgres (and, for the driver auto-draft ride, real-OSRM) coverage
 * of Phase 11's two Definition-of-Done flows
 * (docs/roadmap/phase-11-recurring-rides.md's Testing section):
 *
 *  1. Driver: detection scan finds a repeat corridor -> `suggested` ->
 *     enable -> auto-draft (createRide, reusing the existing ride-creation
 *     endpoint with a `recurringPatternId`) -> confirm (publishRide).
 *  2. Rider: an already-`enabled` pattern -> a real published ride
 *     currently matches it -> `recurring_proactive_match` notification
 *     fires via Phase 7's existing dispatch path, without the rider
 *     re-searching.
 */
describe('Phase 11 — recurring rides (detection, enable, auto-draft, proactive match)', () => {
  const db = getDatabase();
  let testConfigId: string;
  let previousActiveConfigIds: string[] = [];

  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;

  let riderUserId: string;
  let matchDriverUserId: string;
  let matchDriverProfileId: string;
  let matchVehicleId: string;
  let matchRideId: string;
  let riderPatternId: string;

  beforeAll(async () => {
    const existingActive = await db.query.recurringDetectionConfigs.findMany({
      where: eq(recurringDetectionConfigs.active, true),
    });
    previousActiveConfigIds = existingActive.map((c) => c.id);
    if (previousActiveConfigIds.length > 0) {
      await db
        .update(recurringDetectionConfigs)
        .set({ active: false })
        .where(inArray(recurringDetectionConfigs.id, previousActiveConfigIds));
    }
    const [inserted] = await db
      .insert(recurringDetectionConfigs)
      .values({ scope: 'global', ...TEST_CONFIG, active: true })
      .returning();
    testConfigId = inserted!.id;

    const base = Date.now() % 10_000_000;

    // ── Driver-side fixtures ──────────────────────────────────────────
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}7`, fullName: 'Recurring Test Driver' })
      .returning();
    driverUserId = driverUser!.id;

    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId })
      .returning();
    driverProfileId = driverProfile!.id;

    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId,
        make: 'Test',
        model: 'Car',
        color: 'Green',
        plateNumber: `RECUR-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    // fullConfidenceTripCount + 2 completed rides on the exact same corridor
    // and exact same time of day -> confidenceScore = 1.0 regardless of
    // config edge cases, comfortably above suggestedConfidenceThreshold.
    const tripCount = TEST_CONFIG.fullConfidenceTripCount + 2;
    for (let i = 1; i <= tripCount; i += 1) {
      const departureAt = daysAgo(i);
      departureAt.setHours(8, 0, 0, 0);
      await db.insert(rides).values({
        driverProfileId,
        vehicleId,
        originLabel: ORIGIN.label,
        originLat: ORIGIN.lat,
        originLng: ORIGIN.lng,
        destinationLabel: DESTINATION.label,
        destinationLat: DESTINATION.lat,
        destinationLng: DESTINATION.lng,
        departureAt,
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 5,
        status: 'completed',
      });
    }

    // ── Rider-side fixtures (proactive match) ───────────────────────────
    const [riderUser] = await db
      .insert(users)
      .values({ phone: `+216${base}8`, fullName: 'Recurring Test Rider' })
      .returning();
    riderUserId = riderUser!.id;

    const [matchDriverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}9`, fullName: 'Recurring Match Driver' })
      .returning();
    matchDriverUserId = matchDriverUser!.id;

    const [matchDriverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: matchDriverUserId })
      .returning();
    matchDriverProfileId = matchDriverProfile!.id;

    const [matchVehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId: matchDriverProfileId,
        make: 'Test',
        model: 'Car',
        color: 'Blue',
        plateNumber: `MATCH-${base}`,
        seatCount: 4,
      })
      .returning();
    matchVehicleId = matchVehicle!.id;

    // The pattern's target time is ~30 minutes from now, every day — so
    // nextOccurrenceForPattern resolves to "today, in ~30 minutes",
    // trivially within matching.service.ts's TIGHT_TIME_WINDOW_MIN of a
    // ride departing at that same instant.
    const targetTime = new Date(Date.now() + 30 * 60_000);
    const hh = targetTime.getHours().toString().padStart(2, '0');
    const mm = targetTime.getMinutes().toString().padStart(2, '0');

    const [pattern] = await db
      .insert(recurringPatterns)
      .values({
        userId: riderUserId,
        role: 'rider',
        originLabel: ORIGIN.label,
        originLat: ORIGIN.lat,
        originLng: ORIGIN.lng,
        destinationLabel: DESTINATION.label,
        destinationLat: DESTINATION.lat,
        destinationLng: DESTINATION.lng,
        daysOfWeekMask: 0b1111111,
        timeWindowStart: `${hh}:${mm}`,
        timeWindowEnd: `${hh}:${mm}`,
        confidenceScore: 0.9,
        status: 'enabled',
        lastMatchedAt: null,
      })
      .returning();
    riderPatternId = pattern!.id;

    const [matchRide] = await db
      .insert(rides)
      .values({
        driverProfileId: matchDriverProfileId,
        vehicleId: matchVehicleId,
        originLabel: ORIGIN.label,
        originLat: ORIGIN.lat,
        originLng: ORIGIN.lng,
        destinationLabel: DESTINATION.label,
        destinationLat: DESTINATION.lat,
        destinationLng: DESTINATION.lng,
        departureAt: targetTime,
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    matchRideId = matchRide!.id;
  }, 60_000);

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.driverProfileId, driverProfileId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));

    await db.delete(rides).where(eq(rides.driverProfileId, matchDriverProfileId));
    await db.delete(vehicles).where(eq(vehicles.id, matchVehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, matchDriverProfileId));
    await db.delete(users).where(eq(users.id, matchDriverUserId));

    await db.delete(recurringPatterns).where(eq(recurringPatterns.userId, riderUserId));
    await db.delete(users).where(eq(users.id, riderUserId));

    await db.delete(recurringDetectionConfigs).where(eq(recurringDetectionConfigs.id, testConfigId));
    if (previousActiveConfigIds.length > 0) {
      await db
        .update(recurringDetectionConfigs)
        .set({ active: true })
        .where(inArray(recurringDetectionConfigs.id, previousActiveConfigIds));
    }

    await closeQueue();
    await closeDatabase();
  });

  // Rider-flow tests run first, deliberately, and before the driver-flow
  // test below: `runRecurringPatternDetectionScan` (called by the
  // driver-flow test) internally runs the exact same proactive-match check
  // as a side effect (recurring.service.ts folds both responsibilities into
  // one periodic job, per this phase's "reuse the one queue" scope) — it
  // would otherwise consume this suite's one rider match and set
  // `lastMatchedAt` before the dedicated rider-flow test below ever runs.
  it('rider flow: an enabled pattern with a real matching published ride fires recurring_proactive_match', async () => {
    const notifiedCount = await checkProactiveMatchesForEnabledRiderPatterns(db);
    expect(notifiedCount).toBeGreaterThanOrEqual(1);

    const pattern = await db.query.recurringPatterns.findFirst({
      where: eq(recurringPatterns.id, riderPatternId),
    });
    expect(pattern!.lastMatchedAt).not.toBeNull();

    const notification = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, riderUserId), eq(notifications.type, 'recurring_proactive_match')),
    });
    expect(notification).toBeDefined();
    expect((notification!.payload as Record<string, unknown>).rideId).toBe(matchRideId);
    expect((notification!.payload as Record<string, unknown>).patternId).toBe(riderPatternId);

    const queue = getNotificationDispatchQueue();
    expect(queue).not.toBeNull();
    const jobs = await queue!.getJobs(JOB_STATUSES);
    expect(jobs.some((j) => (j.data as { notificationId?: string }).notificationId === notification!.id)).toBe(
      true,
    );
  }, 30_000);

  it('does not re-notify an already-recently-matched pattern (cooldown)', async () => {
    const before = await db.query.recurringPatterns.findFirst({
      where: eq(recurringPatterns.id, riderPatternId),
    });
    expect(before!.lastMatchedAt).not.toBeNull();

    const notifiedCount = await checkProactiveMatchesForEnabledRiderPatterns(db);
    expect(notifiedCount).toBe(0);
  });

  it('driver flow: detection finds the repeat corridor as suggested, enable -> auto-draft -> confirm publishes it', async () => {
    const scanResult = await runRecurringPatternDetectionScan(db);
    expect(scanResult.created).toBeGreaterThanOrEqual(1);

    const detected = await db.query.recurringPatterns.findFirst({
      where: and(eq(recurringPatterns.userId, driverUserId), eq(recurringPatterns.role, 'driver')),
    });
    expect(detected).toBeDefined();
    expect(detected!.status).toBe('suggested');
    expect(detected!.confidenceScore).toBeCloseTo(1, 1);
    expect(detected!.originLabel).toBe(ORIGIN.label);

    const enabled = await updateRecurringPatternStatus(db, detected!.id, driverUserId, {
      action: 'enable',
    });
    expect(enabled.status).toBe('enabled');

    // Auto-draft: reuses the existing ride-creation endpoint/service with
    // pre-filled values, tagged with recurringPatternId — never a bespoke
    // "confirm auto-draft" endpoint.
    const draft = await createRide(db, driverUserId, {
      vehicleId,
      origin: ORIGIN,
      destination: DESTINATION,
      departureAt: new Date(Date.now() + 2 * 3_600_000),
      seatsTotal: 3,
      recurringPatternId: enabled.id,
    });
    expect(draft.status).toBe('draft');
    expect(draft.recurringPatternId).toBe(enabled.id);

    // Confirm: the driver's single tap — never auto-published without this.
    const published = await publishRide(db, draft.id, driverUserId);
    expect(published.status).toBe('published');

    await db.delete(rides).where(eq(rides.id, draft.id));
  }, 30_000);

  it('rejects tagging a ride with a recurring pattern that is not an enabled driver pattern belonging to the caller', async () => {
    await expect(
      createRide(db, driverUserId, {
        vehicleId,
        origin: ORIGIN,
        destination: DESTINATION,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 3,
        recurringPatternId: riderPatternId, // belongs to a different user and is a rider pattern
      }),
    ).rejects.toThrow();
  });
});
