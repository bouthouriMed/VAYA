import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops } from '../../../db/schema/index.js';
import { getRoute } from '../../../lib/routing.js';
import { decodePolyline } from '../../../lib/polyline.js';
import { createBooking, previewBookingDetour } from '../bookings.service.js';
import { ValidationError } from '../../../lib/errors.js';

/**
 * The real, live-validated completion of matching.service.ts's detour_match
 * tier (see MatchCandidate.detour's own doc comment there, and this exact
 * codebase's own direct product feedback: a passenger who finds a detour
 * match must actually be able to request it, not hit a dead end). Exercises
 * the real docker-composed OSRM instance — same discipline as
 * matching-tiers.integration.test.ts, including its honest-degradation
 * pattern when OSRM isn't reachable in this sandbox.
 *
 * The fixture ride HAS real driver-selected stops (unlike
 * bookings-pickup-stop.integration.test.ts's stopless "legacy free-form"
 * ride) — the whole point being tested is that a free-form pickup/dropoff
 * is now accepted on a stops-having ride, provided it's a real, bounded
 * detour.
 */
describe('bookings.service — free-form detour booking on a ride with stops', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;
  let stopId: string;
  const createdRiderIds: string[] = [];
  let osrmUnavailable = false;
  let onRoutePoint: { lat: number; lng: number } | undefined;
  let farOffRoutePoint: { lat: number; lng: number } | undefined;

  const tunis = { lat: 36.8065, lng: 10.1815 };
  const sousse = { lat: 35.8256, lng: 10.6369 };

  async function freshRider(label: string): Promise<string> {
    const base = Date.now() % 10_000_000;
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}${createdRiderIds.length}1`, fullName: label })
      .returning();
    createdRiderIds.push(rider!.id);
    return rider!.id;
  }

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}2`, fullName: 'Detour Booking Test Driver' })
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
        plateNumber: `DETOUR-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    try {
      const route = await getRoute(tunis, sousse);
      if (!route.polyline) {
        osrmUnavailable = true;
        return;
      }
      const points = decodePolyline(route.polyline);
      // A real mid-route point, well away from the one real stop below —
      // stays genuinely on the road, so the live detour check should come
      // back near-zero and pass.
      onRoutePoint = points[Math.floor(points.length * 0.5)]!;
      // Far enough off the corridor (~30km north) to guarantee a real,
      // large detour cost regardless of exactly where on the route it
      // projects — must be rejected.
      const farIdx = Math.floor(points.length * 0.3);
      farOffRoutePoint = { lat: points[farIdx]!.lat + 0.3, lng: points[farIdx]!.lng };

      const [ride] = await db
        .insert(rides)
        .values({
          driverProfileId,
          vehicleId,
          originLabel: 'Tunis',
          originLat: tunis.lat,
          originLng: tunis.lng,
          destinationLabel: 'Sousse',
          destinationLat: sousse.lat,
          destinationLng: sousse.lng,
          departureAt: new Date(Date.now() + 3_600_000),
          seatsTotal: 4,
          seatsAvailable: 4,
          contributionPerSeat: 12,
          status: 'published',
          routePolyline: route.polyline,
          estimatedDurationSec: route.durationSec,
        })
        .returning();
      rideId = ride!.id;

      // One real driver-selected stop near the start of the route — its
      // exact position doesn't matter for these tests (none of them book
      // via pickupStopId), it only needs to exist so this ride is a
      // genuine "has stops" fixture, not the zero-stop legacy case
      // bookings-pickup-stop.integration.test.ts already covers.
      const stopIdx = Math.floor(points.length * 0.1);
      const [stop] = await db
        .insert(routeStops)
        .values({
          rideId,
          sequence: 0,
          label: 'Real mid-route stop',
          lat: points[stopIdx]!.lat,
          lng: points[stopIdx]!.lng,
          roadSnapped: true,
          isDriverSelected: true,
        })
        .returning();
      stopId = stop!.id;
    } catch {
      osrmUnavailable = true;
    }
  }, 60_000);

  afterAll(async () => {
    if (!osrmUnavailable) {
      await db.delete(routeStops).where(eq(routeStops.rideId, rideId));
      await db.delete(rides).where(eq(rides.id, rideId));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    for (const id of createdRiderIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await closeDatabase();
  });

  it('accepts a free-form pickup genuinely on the driver\'s real route (near-zero live-computed detour)', async () => {
    if (osrmUnavailable || !onRoutePoint) return; // Honest degradation, same as matching-tiers.integration.test.ts.
    const riderId = await freshRider('Detour Booking Rider A');
    const booking = await createBooking(db, rideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'On-route pin', lat: onRoutePoint.lat, lng: onRoutePoint.lng },
    });
    expect(booking.pickupStopId).toBeNull();
    expect(booking.pickupLabel).toBe('On-route pin');
    expect(booking.pickupLat).toBe(onRoutePoint.lat);
  }, 30_000);

  it('accepts a free-form dropoff genuinely on the driver\'s real route', async () => {
    if (osrmUnavailable || !onRoutePoint) return;
    const riderId = await freshRider('Detour Booking Rider B');
    const booking = await createBooking(db, rideId, riderId, {
      seatsRequested: 1,
      pickupStopId: stopId,
      dropoff: { label: 'On-route dropoff pin', lat: onRoutePoint.lat, lng: onRoutePoint.lng },
    });
    expect(booking.dropoffStopId).toBeNull();
    expect(booking.dropoffLabel).toBe('On-route dropoff pin');
  }, 30_000);

  it('rejects a free-form pickup that is a real, large detour off the driver\'s route', async () => {
    if (osrmUnavailable || !farOffRoutePoint) return;
    const riderId = await freshRider('Detour Booking Rider C');
    await expect(
      createBooking(db, rideId, riderId, {
        seatsRequested: 1,
        pickup: { label: 'Far-off pin', lat: farOffRoutePoint.lat, lng: farOffRoutePoint.lng },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  }, 30_000);

  it('rejects a free-form dropoff that is a real, large detour off the driver\'s route', async () => {
    if (osrmUnavailable || !farOffRoutePoint) return;
    const riderId = await freshRider('Detour Booking Rider D');
    await expect(
      createBooking(db, rideId, riderId, {
        seatsRequested: 1,
        pickupStopId: stopId,
        dropoff: { label: 'Far-off dropoff pin', lat: farOffRoutePoint.lat, lng: farOffRoutePoint.lng },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  }, 30_000);

  // The driver-facing "insight" this whole capability exists for: real
  // pickup/dropoff times and a real updated trip ETA, not just a distance/
  // duration deviation label — direct product feedback ("the driver should
  // receive a request with... time of pick up, new eta if accepted").
  describe('previewBookingDetour real ETA/route fields', () => {
    it('for a stop-based (planned) pickup/dropoff: newEta equals the ride\'s own baseline arrival, no detour route', async () => {
      if (osrmUnavailable) return;
      const riderId = await freshRider('Detour Preview Rider A');
      const booking = await createBooking(db, rideId, riderId, {
        seatsRequested: 1,
        pickupStopId: stopId,
      });
      const preview = await previewBookingDetour(db, booking.id, driverUserId);
      expect(preview.detourRoutePolyline).toBeNull();
      // Baseline route's own real total duration was recorded on the ride
      // fixture at insert time — newEta should land there exactly (both
      // points planned, zero extra cost).
      const ride = await db.query.rides.findFirst({ where: eq(rides.id, rideId) });
      const expectedNewEta = new Date(ride!.departureAt.getTime() + ride!.estimatedDurationSec! * 1000);
      expect(new Date(preview.newEta).getTime()).toBe(expectedNewEta.getTime());
      // A real, non-fabricated pickup time strictly between departure and
      // the ride's own arrival (the stop sits partway through the route).
      expect(new Date(preview.pickupTime).getTime()).toBeGreaterThan(ride!.departureAt.getTime());
      expect(new Date(preview.pickupTime).getTime()).toBeLessThan(expectedNewEta.getTime());
    }, 30_000);

    it('for a genuine free-form detour pickup: returns a real detour route polyline and a newEta at or after the baseline arrival', async () => {
      if (osrmUnavailable || !onRoutePoint) return;
      const riderId = await freshRider('Detour Preview Rider B');
      const booking = await createBooking(db, rideId, riderId, {
        seatsRequested: 1,
        pickup: { label: 'On-route detour pin', lat: onRoutePoint.lat, lng: onRoutePoint.lng },
      });
      const preview = await previewBookingDetour(db, booking.id, driverUserId);
      expect(preview.detourRoutePolyline).toBeTruthy();
      const ride = await db.query.rides.findFirst({ where: eq(rides.id, rideId) });
      const baselineEta = ride!.departureAt.getTime() + ride!.estimatedDurationSec! * 1000;
      // A real detour insertion never finishes the trip EARLIER than the
      // undetoured baseline.
      expect(new Date(preview.newEta).getTime()).toBeGreaterThanOrEqual(baselineEta);
    }, 30_000);
  });
});
