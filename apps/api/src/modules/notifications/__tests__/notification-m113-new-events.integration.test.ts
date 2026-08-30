import { describe, it, expect, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, trips, bookings, notifications } from '../../../db/schema/index.js';
import { createBooking, acceptBooking, runBookingExpirySweep } from '../../bookings/bookings.service.js';
import { confirmPassengerAboard, startTrip, updateTripLocation } from '../../trips/trips.service.js';
import { closeQueue } from '../../../lib/queue.js';
import { DEADLINE_APPROACHING_LEAD_MINUTES } from '@vaya/domain';

/**
 * M-113 (docs/unified_driver_and_passenger_journey.md §39) — real Postgres
 * (+ real routing, for the ETA case). Proves each of the 4 previously-
 * structurally-missing event types (notification-event-coverage.contract.
 * test.ts's own "documents the exact current event surface" test confirmed
 * absent from the schema enum entirely, not just undispatched) is now a
 * real, dispatched notification, not just a schema addition.
 */
describe('notifications — the 4 new M-113 event types actually dispatch', () => {
  const db = getDatabase();
  const riderIds: string[] = [];
  const driverIds: string[] = [];
  const driverProfileIds: string[] = [];
  const vehicleIds: string[] = [];
  const rideIds: string[] = [];

  const TUNIS = { lat: 36.8065, lng: 10.1815 };
  const SOUSSE = { lat: 35.8256, lng: 10.6369 };

  async function makeRider(suffix: string): Promise<string> {
    const base = Date.now() % 10_000_000;
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}r${suffix}`, fullName: `M113 Rider ${suffix}` })
      .returning();
    riderIds.push(rider!.id);
    return rider!.id;
  }

  async function makeDriverWithRide(suffix: string, departureAt: Date, seatsTotal = 3) {
    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}d${suffix}`, fullName: `M113 Driver ${suffix}` })
      .returning();
    const driverUserId = driverUser!.id;
    driverIds.push(driverUserId);

    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    driverProfileIds.push(driverProfile!.id);

    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId: driverProfile!.id,
        make: 'Test',
        model: 'Car',
        color: 'Blue',
        plateNumber: `M113${suffix}-${base}`,
        seatCount: seatsTotal,
      })
      .returning();
    vehicleIds.push(vehicle!.id);

    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId: driverProfile!.id,
        vehicleId: vehicle!.id,
        originLabel: 'Tunis',
        originLat: TUNIS.lat,
        originLng: TUNIS.lng,
        destinationLabel: 'Sousse',
        destinationLat: SOUSSE.lat,
        destinationLng: SOUSSE.lng,
        departureAt,
        seatsTotal,
        seatsAvailable: seatsTotal,
        contributionPerSeat: 20,
        status: 'published',
      })
      .returning();
    rideIds.push(ride!.id);
    return { driverUserId, driverProfileId: driverProfile!.id, rideId: ride!.id };
  }

  afterAll(async () => {
    for (const rideId of rideIds) {
      await db.delete(rides).where(eq(rides.id, rideId));
    }
    for (const vehicleId of vehicleIds) {
      await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    }
    for (const driverProfileId of driverProfileIds) {
      await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    }
    for (const driverUserId of driverIds) {
      await db.delete(users).where(eq(users.id, driverUserId));
    }
    for (const riderId of riderIds) {
      await db.delete(users).where(eq(users.id, riderId));
    }
    await closeQueue();
    await closeDatabase();
  });

  it('booking_deadline_approaching: fires once for the driver when a pending request nears its response deadline, and never re-expires it early', async () => {
    const riderId = await makeRider('a');
    const departureAt = new Date(Date.now() + 6 * 60 * 60_000);
    const { driverUserId, rideId } = await makeDriverWithRide('a', departureAt);

    const booking = await createBooking(db, rideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
    });

    // Backdate expiresAt to sit inside the reminder lead window, but not
    // past it — this booking must still be genuinely `pending` afterward.
    const soonExpiresAt = new Date(Date.now() + (DEADLINE_APPROACHING_LEAD_MINUTES - 1) * 60_000);
    await db.update(bookings).set({ expiresAt: soonExpiresAt }).where(eq(bookings.id, booking.id));

    const result = await runBookingExpirySweep(db);
    expect(result.deadlineReminded).toBeGreaterThanOrEqual(1);

    const updated = await db.query.bookings.findFirst({ where: eq(bookings.id, booking.id) });
    expect(updated!.status).toBe('pending');
    expect(updated!.deadlineReminderSentAt).not.toBeNull();

    const notif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, driverUserId), eq(notifications.type, 'booking_deadline_approaching')),
      orderBy: (n, { desc }) => desc(n.createdAt),
    });
    expect(notif).toBeDefined();
    expect((notif!.payload as Record<string, unknown>).bookingId).toBe(booking.id);

    // Never re-sent on a later pass.
    await runBookingExpirySweep(db);
    const afterSecondPass = await db.query.bookings.findFirst({ where: eq(bookings.id, booking.id) });
    expect(afterSecondPass!.deadlineReminderSentAt!.getTime()).toBe(updated!.deadlineReminderSentAt!.getTime());
  }, 30_000);

  it('booking_sibling_cancelled: fires for the rider\'s other pending requests once one is accepted, as a real distinct event (not booking_declined)', async () => {
    const riderId = await makeRider('b');
    const departureAt = new Date(Date.now() + 8 * 60 * 60_000);
    const rideE = await makeDriverWithRide('e', departureAt);
    const rideF = await makeDriverWithRide('f', departureAt);

    async function requestSameJourney(rideId: string) {
      return createBooking(db, rideId, riderId, {
        seatsRequested: 1,
        pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
      });
    }

    const bookingE = await requestSameJourney(rideE.rideId);
    const bookingF = await requestSameJourney(rideF.rideId);

    await acceptBooking(db, bookingE.id, rideE.driverUserId);

    const siblingF = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingF.id) });
    expect(siblingF!.status).toBe('superseded');

    const notif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, riderId), eq(notifications.type, 'booking_sibling_cancelled')),
      orderBy: (n, { desc }) => desc(n.createdAt),
    });
    expect(notif).toBeDefined();
    expect((notif!.payload as Record<string, unknown>).bookingId).toBe(bookingF.id);
  }, 30_000);

  it('trip_active: fires for the driver (distinct from the rider-facing trip_passenger_onboard) the moment boarding is confirmed', async () => {
    const riderId = await makeRider('c');
    const departureAt = new Date(Date.now() + 3_600_000);
    const { driverUserId, rideId } = await makeDriverWithRide('c', departureAt);

    const booking = await createBooking(db, rideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
    });
    await acceptBooking(db, booking.id, driverUserId);
    const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });
    await startTrip(db, trip!.id, driverUserId);
    await confirmPassengerAboard(db, trip!.id, driverUserId);

    const driverNotif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, driverUserId), eq(notifications.type, 'trip_active')),
      orderBy: (n, { desc }) => desc(n.createdAt),
    });
    expect(driverNotif).toBeDefined();

    const riderNotif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, riderId), eq(notifications.type, 'trip_passenger_onboard')),
      orderBy: (n, { desc }) => desc(n.createdAt),
    });
    expect(riderNotif).toBeDefined();
  }, 20_000);

  it('trip_eta_changed: the first live ETA recompute only sets a baseline (no notification yet); a later state with a genuinely stale baseline dispatches one real notification to the rider', async () => {
    const riderId = await makeRider('d');
    const departureAt = new Date(Date.now() + 3_600_000);
    const { driverUserId, rideId } = await makeDriverWithRide('d', departureAt);
    const booking = await createBooking(db, rideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
    });
    await acceptBooking(db, booking.id, driverUserId);
    const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });
    await startTrip(db, trip!.id, driverUserId);

    // First-ever ping for this trip: real ETA recompute runs (fresh
    // tripId, never throttled before), but with no prior baseline this
    // only establishes one — never a notification on the very first
    // computation.
    await updateTripLocation(db, trip!.id, driverUserId, { lat: TUNIS.lat + 0.01, lng: TUNIS.lng });
    const afterFirstPing = await db.query.trips.findFirst({ where: eq(trips.id, trip!.id) });
    expect(afterFirstPing!.lastNotifiedEtaSec).not.toBeNull();

    const baselineNotif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, riderId), eq(notifications.type, 'trip_eta_changed')),
    });
    expect(baselineNotif).toBeUndefined();

    // Force a second trip into a state whose stored baseline (0s) is
    // certain to differ from ANY real ETA a Tunis->Sousse route computes
    // by more than the notify threshold — proves the meaningful-change
    // branch dispatches for real, without needing to wait out the
    // in-process recompute throttle on the same trip twice.
    const { driverUserId: driverUserId2, rideId: rideId2 } = await makeDriverWithRide('d2', departureAt);
    const booking2 = await createBooking(db, rideId2, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
    });
    await acceptBooking(db, booking2.id, driverUserId2);
    const trip2 = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking2.id) });
    await startTrip(db, trip2!.id, driverUserId2);
    await db.update(trips).set({ lastNotifiedEtaSec: 0 }).where(eq(trips.id, trip2!.id));

    await updateTripLocation(db, trip2!.id, driverUserId2, { lat: TUNIS.lat + 0.01, lng: TUNIS.lng });

    const changeNotif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, riderId), eq(notifications.type, 'trip_eta_changed')),
      orderBy: (n, { desc }) => desc(n.createdAt),
    });
    expect(changeNotif).toBeDefined();
    expect((changeNotif!.payload as Record<string, unknown>).bookingId).toBe(booking2.id);
  }, 30_000);
});
