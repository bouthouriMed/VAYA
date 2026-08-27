import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import type { Job } from 'bullmq';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import {
  users,
  driverProfiles,
  vehicles,
  rides,
  bookings,
  notifications,
  deviceTokens,
} from '../../../db/schema/index.js';
import { createBooking, acceptBooking, declineBooking } from '../bookings.service.js';
import { getNotificationDispatchQueue, closeQueue } from '../../../lib/queue.js';
import { processNotificationDispatchJob } from '../../notifications/notification-dispatch.worker.js';

const JOB_STATUSES = ['waiting', 'delayed', 'active', 'completed', 'failed'] as const;

/**
 * Exercises real Postgres and real Redis (same discipline as Phases 4-6's
 * integration suites) — this proves two things docs/roadmap/phase-07-notifications.md
 * calls out explicitly:
 *  1. booking_requested/booking_accepted/booking_declined actually create a
 *     `notifications` row and enqueue a real BullMQ dispatch job.
 *  2. A push-send failure can never fail the triggering booking action —
 *     demonstrated directly, not just by architectural inspection: dispatch
 *     is queue-decoupled (never awaited inline by bookings.service.ts), so
 *     acceptBooking/declineBooking resolve successfully even with a
 *     globally-failing push mock already in place, and a separate, explicit
 *     attempt to run that exact job through the worker's processor
 *     afterwards is shown to fail on its own, isolated from the already-
 *     completed booking call.
 */
describe('bookings.service -> notifications dispatch (Phase 7)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let riderAId: string;
  let riderBId: string;
  let rideForAcceptId: string;
  let rideForDeclineId: string;
  let bookingForAcceptId: string;

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}4`, fullName: 'Notif Test Driver' })
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
        plateNumber: `NOTIF-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    const [riderA] = await db
      .insert(users)
      .values({ phone: `+216${base}5`, fullName: 'Notif Rider A' })
      .returning();
    riderAId = riderA!.id;

    const [riderB] = await db
      .insert(users)
      .values({ phone: `+216${base}6`, fullName: 'Notif Rider B' })
      .returning();
    riderBId = riderB!.id;

    const [rideA] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Origin A',
        originLat: 36.8,
        originLng: 10.18,
        destinationLabel: 'Dest A',
        destinationLat: 36.85,
        destinationLng: 10.2,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 2,
        seatsAvailable: 2,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    rideForAcceptId = rideA!.id;

    const [rideB] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Origin B',
        originLat: 36.9,
        originLng: 10.3,
        destinationLabel: 'Dest B',
        destinationLat: 36.95,
        destinationLng: 10.35,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 2,
        seatsAvailable: 2,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    rideForDeclineId = rideB!.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.driverProfileId, driverProfileId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(users).where(eq(users.id, riderAId));
    await db.delete(users).where(eq(users.id, riderBId));
    await closeQueue();
    await closeDatabase();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createBooking creates a booking_requested notification for the driver and enqueues a dispatch job', async () => {
    const booking = await createBooking(db, rideForAcceptId, riderAId, {
      seatsRequested: 1,
      pickup: { label: 'Pickup A', lat: 36.8, lng: 10.18 },
    });
    bookingForAcceptId = booking.id;

    const notification = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, driverUserId), eq(notifications.type, 'booking_requested')),
      orderBy: desc(notifications.createdAt),
    });
    expect(notification).toBeDefined();
    expect((notification!.payload as Record<string, unknown>).bookingId).toBe(booking.id);

    const queue = getNotificationDispatchQueue();
    expect(queue).not.toBeNull();
    const jobs = await queue!.getJobs(JOB_STATUSES);
    expect(jobs.some((j) => j.data.notificationId === notification!.id)).toBe(true);
  });

  it('acceptBooking succeeds and enqueues booking_accepted, independent of whether the eventual push send would fail', async () => {
    // A registered token makes the eventual dispatch attempt meaningful
    // (not just a "no tokens" no-op).
    await db.insert(deviceTokens).values({
      userId: riderAId,
      token: 'ExponentPushToken[integration-test-accept]',
      platform: 'ios',
    });

    const accepted = await acceptBooking(db, bookingForAcceptId, driverUserId);
    // Succeeded — proven before any push send was ever attempted. Dispatch
    // is fully decoupled through the queue (lib/queue.ts); acceptBooking
    // never awaits a push send inline.
    expect(accepted.status).toBe('accepted');

    const notification = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, riderAId), eq(notifications.type, 'booking_accepted')),
      orderBy: desc(notifications.createdAt),
    });
    expect(notification).toBeDefined();

    const queue = getNotificationDispatchQueue();
    const jobs = await queue!.getJobs(JOB_STATUSES);
    expect(jobs.some((j) => j.data.notificationId === notification!.id)).toBe(true);

    // Now prove the isolation directly: actually attempt (and fail) the
    // push send for this exact notification, via the same processor the
    // real worker uses. This must throw (so BullMQ's native retry picks it
    // up) but has zero effect on the already-resolved acceptBooking result.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Expo unreachable')));
    const fakeJob = { data: { notificationId: notification!.id } } as Job<{ notificationId: string }>;
    await expect(processNotificationDispatchJob(db, fakeJob)).rejects.toThrow('Expo unreachable');

    const stillAccepted = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingForAcceptId),
    });
    expect(stillAccepted!.status).toBe('accepted');
  });

  it('declineBooking succeeds and enqueues booking_declined, even with a globally-failing push mock already in place', async () => {
    const booking = await createBooking(db, rideForDeclineId, riderBId, {
      seatsRequested: 1,
      pickup: { label: 'Pickup B', lat: 36.9, lng: 10.3 },
    });

    await db.insert(deviceTokens).values({
      userId: riderBId,
      token: 'ExponentPushToken[integration-test-decline]',
      platform: 'android',
    });

    // Unlike the accept test, the push mock is stubbed to fail *before*
    // calling declineBooking — the strongest form of this assertion: even
    // with the eventual dispatch guaranteed to fail, the triggering API
    // action itself is unaffected because it never touches the push path.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Expo unreachable')));

    const declined = await declineBooking(db, booking.id, driverUserId);
    expect(declined.status).toBe('declined');

    const notification = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, riderBId), eq(notifications.type, 'booking_declined')),
      orderBy: desc(notifications.createdAt),
    });
    expect(notification).toBeDefined();

    const queue = getNotificationDispatchQueue();
    const jobs = await queue!.getJobs(JOB_STATUSES);
    expect(jobs.some((j) => j.data.notificationId === notification!.id)).toBe(true);
  });
});
