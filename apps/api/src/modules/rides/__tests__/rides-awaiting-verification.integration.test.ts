import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import {
  users,
  driverProfiles,
  vehicles,
  rides,
  adminUsers,
  auditLogs,
  notifications,
} from '../../../db/schema/index.js';
import { hashPassword } from '../../../lib/password.js';
import { closeQueue } from '../../../lib/queue.js';
import { runRideExpirySweep } from '../../trips/trips.service.js';

/**
 * A driver still under verification review taps "Publier": the ride used to
 * be rejected outright (403) and was lost, while the app told the driver it
 * was saved. Now it is kept as a `draft` flagged publish_on_verification_at,
 * shows up in the driver's own list, stays invisible to riders, and goes
 * live the moment an admin approves the driver. Real Postgres, real HTTP.
 */
describe('Rides awaiting driver verification (HTTP)', () => {
  let app: FastifyInstance;
  const db = getDatabase();
  const HOUR = 3_600_000;
  let adminUserId: string;
  let adminToken: string;
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let driverToken: string;
  let rejectedUserId: string;
  let rejectedToken: string;
  let rejectedVehicleId: string;
  const createdRideIds: string[] = [];

  const rideBody = (vehicle: string, departureAt: Date) => ({
    vehicleId: vehicle,
    origin: { label: 'Tunis', lat: 36.8065, lng: 10.1815 },
    destination: { label: 'La Marsa', lat: 36.8782, lng: 10.3247 },
    departureAt: departureAt.toISOString(),
    seatsTotal: 3,
  });

  async function createRideAs(token: string, vehicle: string, departureAt: Date) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      headers: { authorization: `Bearer ${token}` },
      payload: rideBody(vehicle, departureAt),
    });
    if (res.statusCode === 200) createdRideIds.push(res.json().id);
    return res;
  }

  async function publishAs(token: string, rideId: string) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/rides/${rideId}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  beforeAll(async () => {
    app = await buildApp();
    const base = Date.now() % 10_000_000;

    const [admin] = await db
      .insert(adminUsers)
      .values({
        email: `awaiting-verif-${base}@vaya.tn`,
        passwordHash: await hashPassword('Test1234!'),
        fullName: 'Awaiting Verification Admin',
        role: 'admin',
      })
      .returning();
    adminUserId = admin!.id;
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/login',
      payload: { email: admin!.email, password: 'Test1234!' },
    });
    adminToken = login.json().accessToken;

    const [driver] = await db
      .insert(users)
      .values({ phone: `+216${base}4`, fullName: 'Pending Driver' })
      .returning();
    driverUserId = driver!.id;
    driverToken = app.jwt.sign({ sub: driverUserId });
    const [profile] = await db
      .insert(driverProfiles)
      .values({
        userId: driverUserId,
        verificationStatus: 'pending',
        verificationSubmittedAt: new Date(),
      })
      .returning();
    driverProfileId = profile!.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId,
        make: 'Peugeot',
        model: '208',
        color: 'Gris',
        plateNumber: `${base}TU1`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    const [rejected] = await db
      .insert(users)
      .values({ phone: `+216${base}5`, fullName: 'Rejected Driver' })
      .returning();
    rejectedUserId = rejected!.id;
    rejectedToken = app.jwt.sign({ sub: rejectedUserId });
    const [rejectedProfile] = await db
      .insert(driverProfiles)
      .values({ userId: rejectedUserId, verificationStatus: 'rejected' })
      .returning();
    const [rejectedVehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId: rejectedProfile!.id,
        make: 'Kia',
        model: 'Rio',
        color: 'Blanc',
        plateNumber: `${base}TU2`,
        seatCount: 4,
      })
      .returning();
    rejectedVehicleId = rejectedVehicle!.id;
  }, 60_000);

  afterAll(async () => {
    if (createdRideIds.length > 0) await db.delete(rides).where(inArray(rides.id, createdRideIds));
    await db
      .delete(notifications)
      .where(inArray(notifications.userId, [driverUserId, rejectedUserId]));
    await db.delete(auditLogs).where(eq(auditLogs.adminUserId, adminUserId));
    await db.delete(users).where(inArray(users.id, [driverUserId, rejectedUserId]));
    await db.delete(adminUsers).where(eq(adminUsers.id, adminUserId));
    await app.close();
    await closeQueue();
    await closeDatabase();
  });

  let futureRideId: string;
  let lateRideId: string;

  it('lets a pending driver create a ride and saves it — not publishes it — on "Publier"', async () => {
    const created = await createRideAs(driverToken, vehicleId, new Date(Date.now() + 48 * HOUR));
    expect(created.statusCode).toBe(200);
    futureRideId = created.json().id;

    const published = await publishAs(driverToken, futureRideId);
    expect(published.statusCode).toBe(200);
    expect(published.json().status).toBe('draft');
    expect(published.json().publishOnVerificationAt).not.toBeNull();
  });

  it('shows the waiting ride in the driver’s own list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/rides/mine',
      headers: { authorization: `Bearer ${driverToken}` },
    });
    expect(res.statusCode).toBe(200);
    const mine = res.json().find((r: { id: string }) => r.id === futureRideId);
    expect(mine?.status).toBe('draft');
    expect(mine?.publishOnVerificationAt).not.toBeNull();
  });

  it('refuses a rejected driver (terminal — the ride could never go live)', async () => {
    const res = await createRideAs(
      rejectedToken,
      rejectedVehicleId,
      new Date(Date.now() + 48 * HOUR),
    );
    expect(res.statusCode).toBe(403);
  });

  it('publishes the waiting ride on approval and expires one whose departure passed', async () => {
    const late = await createRideAs(driverToken, vehicleId, new Date(Date.now() + 2 * HOUR));
    lateRideId = late.json().id;
    expect((await publishAs(driverToken, lateRideId)).statusCode).toBe(200);
    // Simulate review taking longer than the time left before departure.
    await db
      .update(rides)
      .set({ departureAt: new Date(Date.now() - HOUR) })
      .where(eq(rides.id, lateRideId));

    const approve = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/verifications/${driverProfileId}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(approve.statusCode).toBe(200);

    const future = await db.query.rides.findFirst({ where: eq(rides.id, futureRideId) });
    expect(future?.status).toBe('published');
    expect(future?.publishOnVerificationAt).toBeNull();
    const lateRow = await db.query.rides.findFirst({ where: eq(rides.id, lateRideId) });
    expect(lateRow?.status).toBe('expired');

    const notif = await db.query.notifications.findFirst({
      where: eq(notifications.userId, driverUserId),
      orderBy: (n, { desc }) => desc(n.createdAt),
    });
    expect(notif?.type).toBe('verification_approved');
    expect((notif?.payload as { publishedRideCount?: number }).publishedRideCount).toBe(1);
  });

  it('publishes directly once the driver is approved', async () => {
    const created = await createRideAs(driverToken, vehicleId, new Date(Date.now() + 24 * HOUR));
    const res = await publishAs(driverToken, created.json().id);
    expect(res.json().status).toBe('published');
    expect(res.json().publishOnVerificationAt).toBeNull();
  });

  it('the expiry sweep closes a waiting ride whose departure passed without approval', async () => {
    await db
      .update(driverProfiles)
      .set({ verificationStatus: 'under_review' })
      .where(eq(driverProfiles.id, driverProfileId));
    const created = await createRideAs(driverToken, vehicleId, new Date(Date.now() + 3 * HOUR));
    const rideId = created.json().id;
    await publishAs(driverToken, rideId);
    await db
      .update(rides)
      .set({ departureAt: new Date(Date.now() - HOUR) })
      .where(eq(rides.id, rideId));

    await runRideExpirySweep(db);
    const row = await db.query.rides.findFirst({ where: eq(rides.id, rideId) });
    expect(row?.status).toBe('expired');
    expect(row?.publishOnVerificationAt).toBeNull();
  });
});
