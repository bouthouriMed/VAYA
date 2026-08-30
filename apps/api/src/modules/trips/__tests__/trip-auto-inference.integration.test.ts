import { describe, it, expect, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, trips, bookings, notifications } from '../../../db/schema/index.js';
import { createBooking, acceptBooking } from '../../bookings/bookings.service.js';
import { startTrip, updateTripLocation } from '../trips.service.js';
import { haversineDistanceMeters } from '../../../lib/geo.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * Journey-contract second pass (docs/unified_driver_and_passenger_journey.md
 * §33/§35, matrix M-096/097/099/100) plus route-deviation (§29/§51,
 * M-090/EDGE-051/INV-08) — proving the real GPS-pipeline wiring added to
 * trips.service.ts's updateTripLocation, not just the pure domain functions
 * (auto-start-inference.ts / boarding-inference.ts / live-corridor.ts)
 * already covered in isolation by packages/domain's own unit suites.
 */

/** Minimal Google-polyline-algorithm (precision 5) encoder — the inverse of
 *  lib/polyline.ts's decodePolyline. Needed here because this sandbox's
 *  OSRM has no prepared Tunisia map data (lib/routing.ts's haversine
 *  fallback always yields an empty polyline, per docs/roadmap/README.md's
 *  documented environmental limitation), so a real non-empty
 *  `rides.routePolyline` for the deviation tests has to be hand-encoded and
 *  written directly, not produced via the real routing call. */
function encodeSignedNumber(num: number): string {
  let sgn = num << 1;
  if (num < 0) sgn = ~sgn;
  return encodeNumber(sgn);
}
function encodeNumber(num: number): string {
  let encoded = '';
  while (num >= 0x20) {
    encoded += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  encoded += String.fromCharCode(num + 63);
  return encoded;
}
function encodePolyline(points: { lat: number; lng: number }[]): string {
  let output = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    output += encodeSignedNumber(lat - prevLat);
    output += encodeSignedNumber(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return output;
}

describe('trips.service — Layer-A auto-inference wired into the real GPS pipeline', () => {
  const db = getDatabase();
  const userIds: string[] = [];
  const rideIds: string[] = [];
  const vehicleIds: string[] = [];
  const driverProfileIds: string[] = [];

  async function makeDriverWithRide(opts: {
    departureAt: Date;
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    routePolyline?: string | null;
  }) {
    const base = Math.floor(Math.random() * 1_000_000_000);

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'Auto-Inference Driver' })
      .returning();
    const driverUserId = driverUser!.id;
    userIds.push(driverUserId);

    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    const driverProfileId = driverProfile!.id;
    driverProfileIds.push(driverProfileId);

    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId,
        make: 'Test',
        model: 'Car',
        color: 'Blue',
        plateNumber: `AUTOI-${base}`,
        seatCount: 4,
      })
      .returning();
    const vehicleId = vehicle!.id;
    vehicleIds.push(vehicleId);

    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}2`, fullName: 'Auto-Inference Rider' })
      .returning();
    const riderId = rider!.id;
    userIds.push(riderId);

    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Origin',
        originLat: opts.origin.lat,
        originLng: opts.origin.lng,
        destinationLabel: 'Destination',
        destinationLat: opts.destination.lat,
        destinationLng: opts.destination.lng,
        departureAt: opts.departureAt,
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 5,
        status: 'published',
        ...(opts.routePolyline !== undefined ? { routePolyline: opts.routePolyline } : {}),
      })
      .returning();
    const rideId = ride!.id;
    rideIds.push(rideId);

    const booking = await createBooking(db, rideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Origin', lat: opts.origin.lat, lng: opts.origin.lng },
    });
    await acceptBooking(db, booking.id, driverUserId);
    const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });

    return { driverUserId, riderId, rideId, bookingId: booking.id, tripId: trip!.id };
  }

  afterAll(async () => {
    for (const rideId of rideIds) {
      await db.delete(bookings).where(eq(bookings.rideId, rideId));
      await db.delete(rides).where(eq(rides.id, rideId));
    }
    for (const vehicleId of vehicleIds) {
      await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    }
    for (const driverProfileId of driverProfileIds) {
      await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    }
    for (const userId of userIds) {
      await db.delete(users).where(eq(users.id, userId));
    }
    await closeQueue();
    await closeDatabase();
  });

  const ORIGIN = { lat: 36.8000, lng: 10.1800 };
  const DESTINATION = { lat: 36.8100, lng: 10.1900 };

  describe('M-099/M-100: auto-start (scheduled -> driver_approaching, no button tap)', () => {
    it('auto-advances once the scheduled departure time is reached AND the driver is near the origin', async () => {
      const { driverUserId, tripId, riderId } = await makeDriverWithRide({
        departureAt: new Date(Date.now() - 60_000), // already reached
        origin: ORIGIN,
        destination: DESTINATION,
      });

      const before = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
      expect(before!.status).toBe('scheduled');

      const result = await updateTripLocation(db, tripId, driverUserId, {
        lat: ORIGIN.lat,
        lng: ORIGIN.lng,
      });

      expect(result.trip.status).toBe('driver_approaching');
      expect(result.trip.startedAt).not.toBeNull();

      const notif = await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, riderId), eq(notifications.type, 'trip_driver_approaching')),
      });
      expect(notif).toBeDefined();
    }, 15_000);

    it("does NOT auto-advance on origin proximity alone before departure time is reached — timeReached is a required anchor signal (ambiguity-log A-6)", async () => {
      const { driverUserId, tripId } = await makeDriverWithRide({
        departureAt: new Date(Date.now() + 3_600_000), // 1h in the future
        origin: ORIGIN,
        destination: DESTINATION,
      });

      const result = await updateTripLocation(db, tripId, driverUserId, {
        lat: ORIGIN.lat,
        lng: ORIGIN.lng,
      });

      // Real origin proximity, zero time-based evidence: must stay scheduled
      // (the driver could just be near the origin for an unrelated reason).
      expect(result.trip.status).toBe('scheduled');
    }, 15_000);
  });

  describe('M-096/M-097: boarding auto-detection (pickup -> active, no button tap)', () => {
    async function driveToPickup(departureAt: Date) {
      const { driverUserId, tripId, riderId } = await makeDriverWithRide({
        departureAt,
        origin: ORIGIN,
        destination: DESTINATION,
      });
      await updateTripLocation(db, tripId, driverUserId, { lat: ORIGIN.lat, lng: ORIGIN.lng });
      const afterStart = await updateTripLocation(db, tripId, driverUserId, {
        lat: ORIGIN.lat,
        lng: ORIGIN.lng,
      });
      expect(afterStart.trip.status).toBe('pickup');
      return { driverUserId, tripId, riderId };
    }

    it('boards automatically once proximity has been genuinely sustained plus a corroborating movement/route signal', async () => {
      const { driverUserId, tripId, riderId } = await driveToPickup(new Date(Date.now() - 60_000));

      // Backdate pickupConfirmedAt so the sustained-proximity window
      // (BOARDING_SUSTAINED_PROXIMITY_MIN_MS = 15s) is already satisfied
      // without a real 15s wait in the test.
      await db
        .update(trips)
        .set({ pickupConfirmedAt: new Date(Date.now() - 20_000) })
        .where(eq(trips.id, tripId));

      const totalDist = haversineDistanceMeters(ORIGIN, DESTINATION);
      const t = 25 / totalDist; // ~25m step toward the destination
      const shifted = {
        lat: ORIGIN.lat + t * (DESTINATION.lat - ORIGIN.lat),
        lng: ORIGIN.lng + t * (DESTINATION.lng - ORIGIN.lng),
      };
      // Sanity-check the fixture's own geometry before trusting it as
      // real evidence: within the 150m arrival radius of pickup (still
      // "at" the pickup point), yet a genuine >=15m step toward destination.
      expect(haversineDistanceMeters(ORIGIN, shifted)).toBeGreaterThan(15);
      expect(haversineDistanceMeters(ORIGIN, shifted)).toBeLessThan(150);
      expect(haversineDistanceMeters(shifted, DESTINATION)).toBeLessThan(
        haversineDistanceMeters(ORIGIN, DESTINATION),
      );

      const result = await updateTripLocation(db, tripId, driverUserId, shifted);
      expect(result.trip.status).toBe('active');

      const notif = await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, riderId), eq(notifications.type, 'trip_passenger_onboard')),
      });
      expect(notif).toBeDefined();
    }, 15_000);

    it('P7 hard gate: does NOT board on momentary proximity alone, even with real movement — sustained proximity is non-negotiable', async () => {
      const { driverUserId, tripId } = await driveToPickup(new Date(Date.now() - 60_000));
      // pickupConfirmedAt left at "now" (set by the just-happened auto
      // transition) — proximity has NOT been sustained for the required
      // window yet.
      const totalDist = haversineDistanceMeters(ORIGIN, DESTINATION);
      const t = 25 / totalDist;
      const shifted = {
        lat: ORIGIN.lat + t * (DESTINATION.lat - ORIGIN.lat),
        lng: ORIGIN.lng + t * (DESTINATION.lng - ORIGIN.lng),
      };

      const result = await updateTripLocation(db, tripId, driverUserId, shifted);
      expect(result.trip.status).toBe('pickup'); // still not boarded
    }, 15_000);
  });

  describe('M-090/EDGE-051/INV-08: live route-deviation classification', () => {
    it('classifies a real deviation, updates the live corridor, notifies exactly once, and never mutates the planned route', async () => {
      const plannedWaypoints = [
        ORIGIN,
        { lat: (ORIGIN.lat + DESTINATION.lat) / 2, lng: (ORIGIN.lng + DESTINATION.lng) / 2 },
        DESTINATION,
      ];
      const encodedPolyline = encodePolyline(plannedWaypoints);

      const { driverUserId, tripId, riderId, rideId } = await makeDriverWithRide({
        departureAt: new Date(Date.now() - 60_000),
        origin: ORIGIN,
        destination: DESTINATION,
        routePolyline: encodedPolyline,
      });

      // Manual start (bypasses auto-start entirely) so this suite tests
      // deviation classification in isolation from the auto-start signals
      // already covered above.
      await startTrip(db, tripId, driverUserId);

      // On the planned route: no deviation, no notification.
      const onRoute = await updateTripLocation(db, tripId, driverUserId, ORIGIN);
      expect(onRoute.trip.routeDeviationStatus).toBe('on_route');

      // ~1.1km perpendicular offset from the route — well past the 400m
      // real-deviation ceiling.
      const farOff = { lat: ORIGIN.lat + 0.01, lng: ORIGIN.lng };
      const deviated = await updateTripLocation(db, tripId, driverUserId, farOff);
      expect(deviated.trip.routeDeviationStatus).toBe('real_deviation');
      expect(deviated.trip.liveCorridorWaypoints).not.toBeNull();

      const notifsAfterFirst = await db.query.notifications.findMany({
        where: and(eq(notifications.userId, riderId), eq(notifications.type, 'trip_route_deviation')),
      });
      expect(notifsAfterFirst).toHaveLength(1);

      // Still deviated on the very next ping: must NOT re-notify.
      const stillDeviated = await updateTripLocation(db, tripId, driverUserId, {
        lat: farOff.lat + 0.0002,
        lng: farOff.lng,
      });
      expect(stillDeviated.trip.routeDeviationStatus).toBe('real_deviation');

      const notifsAfterSecond = await db.query.notifications.findMany({
        where: and(eq(notifications.userId, riderId), eq(notifications.type, 'trip_route_deviation')),
      });
      expect(notifsAfterSecond).toHaveLength(1); // unchanged — not a second event

      // INV-08: the planned route itself was never rewritten by the
      // deviation, no matter how large.
      const ride = await db.query.rides.findFirst({ where: eq(rides.id, rideId) });
      expect(ride!.routePolyline).toBe(encodedPolyline);
    }, 20_000);
  });
});
