import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { adminUsers, bookings, meetingPoints, operationalConfigs, users, driverProfiles, vehicles, rides } from '../../../db/schema/index.js';
import { closeQueue } from '../../../lib/queue.js';
import { recordMeetingPointUsage } from '../meeting-points.service.js';
import { getPickupOutcomes } from '../../admin/admin-analytics.service.js';
import {
  clearOperationalConfigCache,
  getActiveOperationalConfig,
  meetingWeightsOf,
  updateOperationalConfig,
} from '../../operational-config/operational-config.service.js';
import { DEFAULT_MEETING_WEIGHTS } from '@vaya/domain';

describe('learning from outcomes (Phase 14 Track E)', () => {
  const db = getDatabase();
  const base = Date.now() % 10_000_000;
  const sourceRef = `osm:node/learning-${base}`;
  let meetingPointId: string;
  let driverUserId: string;
  let riderIds: string[] = [];
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;
  let adminUserId: string;
  let previousConfig: typeof operationalConfigs.$inferSelect | undefined;

  beforeAll(async () => {
    const [point] = await db
      .insert(meetingPoints)
      .values({ kind: 'louage_station', label: 'Station louage Moncef Bey', lat: 36.79, lng: 10.18, sourceRef })
      .returning();
    meetingPointId = point!.id;

    const [driver] = await db.insert(users).values({ phone: `+21694${base}`, fullName: 'Learning Driver' }).returning();
    driverUserId = driver!.id;
    const riders = await db
      .insert(users)
      .values([1, 2, 3].map((n) => ({ phone: `+2169${n}0${base}`, fullName: `Learning Rider ${n}` })))
      .returning();
    riderIds = riders.map((r) => r.id);
    const [profile] = await db.insert(driverProfiles).values({ userId: driverUserId, verificationStatus: 'approved' }).returning();
    driverProfileId = profile!.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId, make: 'Test', model: 'Car', color: 'Grey', plateNumber: `LRN-${base}`, seatCount: 4 })
      .returning();
    vehicleId = vehicle!.id;
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Tunis',
        originLat: 36.8,
        originLng: 10.18,
        destinationLabel: 'Sousse',
        destinationLat: 35.83,
        destinationLng: 10.63,
        departureAt: new Date(Date.now() + 26 * 3_600_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 12,
        status: 'published',
      })
      .returning();
    rideId = ride!.id;
    const booking = (riderId: string, status: 'accepted' | 'declined' | 'completed', meetingPoint: string | null) => ({
      rideId,
      riderId,
      seatsRequested: 1,
      contributionTotal: 12,
      status,
      pickupLabel: 'Point',
      pickupLat: 36.79,
      pickupLng: 10.18,
      pickupMeetingPointId: meetingPoint,
    });
    await db.insert(bookings).values([
      booking(riderIds[0]!, 'completed', meetingPointId),
      booking(riderIds[1]!, 'declined', meetingPointId),
      booking(riderIds[2]!, 'accepted', null),
    ]);

    const [admin] = await db
      .insert(adminUsers)
      .values({ email: `learning-admin-${base}@vaya-test.local`, passwordHash: 'not-a-real-hash', fullName: 'Learning Admin', role: 'admin' })
      .returning();
    adminUserId = admin!.id;
    previousConfig = await db.query.operationalConfigs.findFirst({
      where: eq(operationalConfigs.scope, 'national'),
    });
  }, 30_000);

  afterAll(async () => {
    if (previousConfig) {
      await db
        .update(operationalConfigs)
        .set({ meetingDetourWeight: previousConfig.meetingDetourWeight, meetingUsageBoostSeconds: previousConfig.meetingUsageBoostSeconds })
        .where(eq(operationalConfigs.id, previousConfig.id));
    } else {
      await db.delete(operationalConfigs).where(eq(operationalConfigs.scope, 'national'));
    }
    clearOperationalConfigCache();
    await db.delete(bookings).where(eq(bookings.rideId, rideId));
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(meetingPoints).where(eq(meetingPoints.sourceRef, sourceRef));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(inArray(users.id, [driverUserId, ...riderIds]));
    await db.delete(adminUsers).where(eq(adminUsers.id, adminUserId));
    await closeQueue();
    await closeDatabase();
  });

  it('counts one use per completed trip, even when it boarded and alighted at the same point', async () => {
    const usedAt = new Date();
    await recordMeetingPointUsage(db, [meetingPointId, meetingPointId], usedAt);
    await recordMeetingPointUsage(db, [meetingPointId, null], usedAt);
    const point = await db.query.meetingPoints.findFirst({ where: eq(meetingPoints.id, meetingPointId) });
    expect(point!.usageCount).toBe(2);
    expect(point!.lastUsedAt?.getTime()).toBe(usedAt.getTime());
  });

  it('reports request outcomes by kind of pickup place, and the most-used points', async () => {
    const outcomes = await getPickupOutcomes(db, 30);
    const louage = outcomes.byKind.find((row) => row.placeKind === 'louage_station');
    expect(louage).toMatchObject({ requests: 2, accepted: 1, declined: 1, completed: 1, acceptanceRate: 0.5 });
    expect(outcomes.byKind.find((row) => row.placeKind === 'other')!.accepted).toBeGreaterThanOrEqual(1);
    expect(outcomes.topMeetingPoints.some((p) => p.id === meetingPointId)).toBe(true);
  });

  it('feeds admin-set weights to the pickup choice, falling back per field to the defaults', async () => {
    await updateOperationalConfig(db, { meetingDetourWeight: 2.5, meetingUsageBoostSeconds: 30 }, adminUserId);
    const weights = meetingWeightsOf(await getActiveOperationalConfig(db));
    expect(weights.detourWeight).toBe(2.5);
    expect(weights.usageBoostSeconds).toBe(30);
    expect(weights.cityWalkWeight).toBe(previousConfig?.meetingCityWalkWeight ?? DEFAULT_MEETING_WEIGHTS.cityWalkWeight);
  });
});
