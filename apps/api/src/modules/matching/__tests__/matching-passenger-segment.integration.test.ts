import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops, bookings } from '../../../db/schema/index.js';
import { upsertRouteGeometry } from '../../../lib/spatial.js';
import { createBooking, previewBookingDetour } from '../../bookings/bookings.service.js';
import { closeQueue } from '../../../lib/queue.js';
import { searchRides } from '../matching.service.js';

/**
 * The reported bug, end-to-end against real Postgres:
 *
 *   Driver A publishes  Cité Tahrir -> La Marsa  at 19:10
 *   Passenger B searches Menzah 6  -> Lac 2     at 19:20
 *
 * The driver's route passes Menzah 6 and Lac 2, so this is a valid match —
 * but the passenger was shown "Menzah 6 -> La Marsa": the driver's
 * destination standing in for the passenger's. The passenger's own journey
 * must stay authoritative for everything passenger-facing (pickup near
 * Menzah 6, dropoff near Lac 2, ETA to THEIR pickup), while the driver keeps
 * seeing their own Cité Tahrir -> La Marsa ride plus this passenger's
 * pickup/dropoff and detour.
 *
 * The route polyline is hand-encoded (same reason as
 * matching-in-progress.integration.test.ts: no prepared Tunisia routing
 * graph in a sandbox), following the real corridor through all four places.
 */

function encodeSignedNumber(num: number): string {
  let sgn = num << 1;
  if (num < 0) sgn = ~sgn;
  let encoded = '';
  while (sgn >= 0x20) {
    encoded += String.fromCharCode((0x20 | (sgn & 0x1f)) + 63);
    sgn >>= 5;
  }
  return encoded + String.fromCharCode(sgn + 63);
}
function encodePolyline(points: { lat: number; lng: number }[]): string {
  let output = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    output += encodeSignedNumber(lat - prevLat) + encodeSignedNumber(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return output;
}

const CITE_TAHRIR = { lat: 36.826, lng: 10.14 };
const MENZAH_6 = { lat: 36.848, lng: 10.172 };
const LAC_2 = { lat: 36.851, lng: 10.272 };
const LA_MARSA = { lat: 36.878, lng: 10.324 };

// Passenger's own searched points, a little off the driver's exact road.
const PASSENGER_ORIGIN = { lat: 36.8495, lng: 10.1735 };
const PASSENGER_DESTINATION = { lat: 36.853, lng: 10.2735 };

describe('matching.service — passenger journey is a sub-segment of the driver route (Cité Tahrir -> La Marsa vs Menzah 6 -> Lac 2)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let riderId: string;
  const rideIds: string[] = [];

  let rideId: string;
  let menzahStopId: string;
  let lacStopId: string;
  let marsaStopId: string;
  // A second ride on the same corridor with NO stop near Lac 2 — its only
  // stop on the passenger's destination side is at La Marsa itself.
  let noLacStopRideId: string;

  // 19:10 tomorrow for the driver, 19:20 for the passenger.
  const driverDeparture = new Date();
  driverDeparture.setDate(driverDeparture.getDate() + 1);
  driverDeparture.setHours(19, 10, 0, 0);
  const passengerWhen = new Date(driverDeparture.getTime() + 10 * 60_000);
  const ESTIMATED_DURATION_SEC = 30 * 60;

  beforeAll(async () => {
    const base = Math.floor(Math.random() * 1_000_000_000);
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'Segment Test Driver' })
      .returning();
    driverUserId = driverUser!.id;
    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    driverProfileId = driverProfile!.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId, make: 'Test', model: 'Car', color: 'Grey', plateNumber: `SEG-${base}`, seatCount: 4 })
      .returning();
    vehicleId = vehicle!.id;
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}2`, fullName: 'Segment Test Rider' })
      .returning();
    riderId = rider!.id;

    const polyline = encodePolyline([CITE_TAHRIR, MENZAH_6, LAC_2, LA_MARSA]);

    async function insertRide(): Promise<string> {
      const [ride] = await db
        .insert(rides)
        .values({
          driverProfileId,
          vehicleId,
          originLabel: 'Cité Tahrir, Tunis',
          originLat: CITE_TAHRIR.lat,
          originLng: CITE_TAHRIR.lng,
          destinationLabel: 'La Marsa',
          destinationLat: LA_MARSA.lat,
          destinationLng: LA_MARSA.lng,
          departureAt: driverDeparture,
          seatsTotal: 3,
          seatsAvailable: 3,
          contributionPerSeat: 4,
          status: 'published',
          routePolyline: polyline,
          estimatedDurationSec: ESTIMATED_DURATION_SEC,
        })
        .returning();
      rideIds.push(ride!.id);
      await upsertRouteGeometry(db, ride!.id, polyline);
      return ride!.id;
    }
    async function insertStop(forRide: string, sequence: number, label: string, point: { lat: number; lng: number }) {
      const [row] = await db
        .insert(routeStops)
        .values({ rideId: forRide, sequence, label, lat: point.lat, lng: point.lng, roadSnapped: true, isDriverSelected: true })
        .returning();
      return row!.id;
    }

    rideId = await insertRide();
    await insertStop(rideId, 0, 'Cité Tahrir — Station', CITE_TAHRIR);
    menzahStopId = await insertStop(rideId, 1, 'Menzah 6 — Av. Hédi Nouira', { lat: 36.8475, lng: 10.1725 });
    lacStopId = await insertStop(rideId, 2, 'Lac 2 — Rue du Lac Windermere', { lat: 36.8505, lng: 10.2712 });
    marsaStopId = await insertStop(rideId, 3, 'La Marsa — Centre', LA_MARSA);

    noLacStopRideId = await insertRide();
    await insertStop(noLacStopRideId, 0, 'Cité Tahrir — Station', CITE_TAHRIR);
    await insertStop(noLacStopRideId, 1, 'Menzah 6 — Av. Hédi Nouira', { lat: 36.8475, lng: 10.1725 });
    await insertStop(noLacStopRideId, 2, 'La Marsa — Centre', LA_MARSA);
  }, 30_000);

  afterAll(async () => {
    await db.delete(bookings).where(inArray(bookings.rideId, rideIds));
    await db.delete(routeStops).where(inArray(routeStops.rideId, rideIds));
    await db.delete(rides).where(inArray(rides.id, rideIds));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(inArray(users.id, [driverUserId, riderId]));
    await closeQueue();
    await closeDatabase();
  });

  const search = () =>
    searchRides(db, {
      originLat: PASSENGER_ORIGIN.lat,
      originLng: PASSENGER_ORIGIN.lng,
      destinationLat: PASSENGER_DESTINATION.lat,
      destinationLng: PASSENGER_DESTINATION.lng,
      when: passengerWhen,
    });

  it("passenger-facing result is Menzah 6 -> Lac 2 (their own journey), never Menzah 6 -> La Marsa", async () => {
    const result = await search();
    const match = result.candidates.find((c) => c.rideId === rideId);
    expect(match).toBeDefined();

    // The passenger's own journey is echoed back, authoritative.
    expect(match!.passengerJourney).toEqual({
      originLat: PASSENGER_ORIGIN.lat,
      originLng: PASSENGER_ORIGIN.lng,
      destinationLat: PASSENGER_DESTINATION.lat,
      destinationLng: PASSENGER_DESTINATION.lng,
    });
    // Optimized pickup near Menzah 6, dropoff near Lac 2 — not La Marsa.
    expect(match!.pickupPoint?.stopId).toBe(menzahStopId);
    expect(match!.dropoffPoint?.stopId).toBe(lacStopId);
    expect(match!.dropoffPoint?.stopId).not.toBe(marsaStopId);
    expect(match!.dropoffPoint?.label).toContain('Lac 2');
    expect(match!.recommendedStopId).toBe(menzahStopId);
    expect(match!.recommendedDropoffStopId).toBe(lacStopId);
    expect(match!.rankedDropoffStops.map((s) => s.stopId)).not.toContain(marsaStopId);
    expect(match!.pickupViable).toBe(true);
    expect(match!.dropoffViable).toBe(true);

    // Minimal walking, a few minutes each way.
    expect(match!.pickupWalkMinutes).toBeLessThan(5);
    expect(match!.dropoffWalkMinutes).toBeLessThan(5);

    // The driver reaches the passenger's pickup partway through the trip
    // (not at the 19:10 departure from Cité Tahrir), and the dropoff before
    // the driver's own arrival in La Marsa.
    expect(match!.pickupEtaSeconds).toBeGreaterThan(0);
    expect(match!.pickupEtaSeconds).toBeLessThan(match!.dropoffEtaSeconds);
    expect(match!.dropoffEtaSeconds).toBeLessThan(ESTIMATED_DURATION_SEC);
  });

  it("the driver's own route stays Cité Tahrir -> La Marsa in the candidate and in the database", async () => {
    const result = await search();
    const match = result.candidates.find((c) => c.rideId === rideId)!;
    expect({ lat: match.originLat, lng: match.originLng }).toEqual(CITE_TAHRIR);
    expect({ lat: match.destinationLat, lng: match.destinationLng }).toEqual(LA_MARSA);

    const ride = await db.query.rides.findFirst({ where: eq(rides.id, rideId) });
    expect(ride!.originLabel).toBe('Cité Tahrir, Tunis');
    expect(ride!.destinationLabel).toBe('La Marsa');
  });

  it("a ride whose only stop near the passenger's destination side is the driver's own destination (La Marsa) is not offered as a Lac 2 match", async () => {
    const result = await search();
    const match = result.candidates.find((c) => c.rideId === noLacStopRideId);
    expect(match).toBeUndefined();
  });

  it('a reversed search (Lac 2 -> Menzah 6) against a driver heading toward La Marsa is not a match', async () => {
    const result = await searchRides(db, {
      originLat: PASSENGER_DESTINATION.lat,
      originLng: PASSENGER_DESTINATION.lng,
      destinationLat: PASSENGER_ORIGIN.lat,
      destinationLng: PASSENGER_ORIGIN.lng,
      when: passengerWhen,
    });
    expect(result.candidates.find((c) => c.rideId === rideId)).toBeUndefined();
  });

  it("booking the resolved points stores the passenger's own segment, and the driver sees their ride plus this passenger's pickup/dropoff and detour", async () => {
    const result = await search();
    const match = result.candidates.find((c) => c.rideId === rideId)!;

    const booking = await createBooking(db, rideId, riderId, {
      seatsRequested: 1,
      pickupStopId: match.pickupPoint!.stopId!,
      dropoffStopId: match.dropoffPoint!.stopId!,
      requestedPickup: { label: 'Menzah 6', ...PASSENGER_ORIGIN },
      requestedDropoff: { label: 'Lac 2', ...PASSENGER_DESTINATION },
    });
    expect(booking.pickupLabel).toContain('Menzah 6');
    expect(booking.dropoffLabel).toContain('Lac 2');

    const preview = await previewBookingDetour(db, booking.id, driverUserId);
    expect(preview.pickup.label).toContain('Menzah 6');
    expect(preview.dropoff.label).toContain('Lac 2');
    // Both are planned stops on the driver's own route: no extra detour.
    expect(preview.pickup.isPlannedStop).toBe(true);
    expect(preview.dropoff.isPlannedStop).toBe(true);
    expect(new Date(preview.pickupTime).getTime()).toBeGreaterThan(driverDeparture.getTime());
    expect(new Date(preview.pickupTime).getTime()).toBeLessThan(new Date(preview.dropoffTime).getTime());
    // The driver's own arrival (La Marsa) is unchanged by this passenger.
    expect(new Date(preview.newEta).getTime()).toBe(driverDeparture.getTime() + ESTIMATED_DURATION_SEC * 1000);

    const ride = await db.query.rides.findFirst({ where: eq(rides.id, rideId) });
    expect(ride!.destinationLabel).toBe('La Marsa');
  });
});
