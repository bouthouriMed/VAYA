import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides } from '../../../db/schema/index.js';
import { upsertRouteGeometry } from '../../../lib/spatial.js';
import { closeQueue } from '../../../lib/queue.js';

// The routing engine is the one thing faked here: a route with the
// passenger inserted costs the driver 150 s more than the ride's own
// route. Everything else — Postgres, PostGIS pre-filters, every tier —
// runs for real.
const EXTRA_SECONDS = 150;
vi.mock('../../../lib/routing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/routing.js')>();
  return {
    ...actual,
    getRoute: vi.fn(async (_o: unknown, _d: unknown, waypoints: unknown[] = []) => ({
      polyline: '',
      distanceM: 9000 + (waypoints.length > 0 ? 1500 : 0),
      durationSec: 900 + (waypoints.length > 0 ? EXTRA_SECONDS : 0),
      isEstimate: false,
    })),
  };
});

const { searchRides } = await import('../matching.service.js');

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

// A ~9 km city commute west -> east.
const PASSENGER_ORIGIN = { lat: 36.8, lng: 10.1 };
const PASSENGER_DESTINATION = { lat: 36.8, lng: 10.2 };

describe('matching.service — the detour tier runs alongside the other tiers (Phase 14 Track C)', () => {
  const db = getDatabase();
  const base = Date.now() % 10_000_000;
  const departure = new Date(Date.now() + 26 * 3_600_000);
  const rideIds: string[] = [];
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let endpointRideId: string;
  let detourOnlyRideId: string;

  async function insertRide(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<string> {
    const polyline = encodePolyline([origin, destination]);
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Origin',
        originLat: origin.lat,
        originLng: origin.lng,
        destinationLabel: 'Destination',
        destinationLat: destination.lat,
        destinationLng: destination.lng,
        departureAt: departure,
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 4,
        status: 'published',
        routePolyline: polyline,
        estimatedDurationSec: 900,
      })
      .returning();
    rideIds.push(ride!.id);
    await upsertRouteGeometry(db, ride!.id, polyline);
    return ride!.id;
  }

  beforeAll(async () => {
    const [driver] = await db.insert(users).values({ phone: `+21695${base}`, fullName: 'Detour Alongside Driver' }).returning();
    driverUserId = driver!.id;
    const [profile] = await db.insert(driverProfiles).values({ userId: driverUserId, verificationStatus: 'approved' }).returning();
    driverProfileId = profile!.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId, make: 'Test', model: 'Car', color: 'Grey', plateNumber: `DAL-${base}`, seatCount: 4 })
      .returning();
    vehicleId = vehicle!.id;

    // Starts and ends next to the passenger: an ordinary endpoint match.
    endpointRideId = await insertRide({ lat: 36.801, lng: 10.101 }, { lat: 36.801, lng: 10.199 });
    // Starts ~3.7 km north of the passenger — beyond walking and extended
    // reach, so no tier but the detour one can offer it — and ends at
    // their destination. Picking them up costs the driver 2.5 minutes.
    detourOnlyRideId = await insertRide({ lat: 36.833, lng: 10.1 }, { lat: 36.8005, lng: 10.2 });
  }, 30_000);

  afterAll(async () => {
    await db.delete(rides).where(inArray(rides.id, rideIds));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await closeQueue();
    await closeDatabase();
  });

  it('offers the detour-only ride even though another ride already matched', async () => {
    const result = await searchRides(db, {
      originLat: PASSENGER_ORIGIN.lat,
      originLng: PASSENGER_ORIGIN.lng,
      destinationLat: PASSENGER_DESTINATION.lat,
      destinationLng: PASSENGER_DESTINATION.lng,
      when: departure,
    });

    const endpoint = result.candidates.find((c) => c.rideId === endpointRideId);
    const detour = result.candidates.find((c) => c.rideId === detourOnlyRideId);
    expect(endpoint).toBeDefined();
    expect(endpoint!.matchType).not.toBe('detour');
    expect(detour?.matchType).toBe('detour');
    expect(detour!.detour!.extraDurationSeconds).toBe(EXTRA_SECONDS);
    // The overall tier still describes the ordinary matches.
    expect(result.tier).not.toBe('detour_match');
  });
});
