import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { bookings, meetingPoints, routeStops, users, driverProfiles, vehicles, rides } from '../../../db/schema/index.js';
import { closeQueue } from '../../../lib/queue.js';

// The routing engine is the only fake: a route with the passenger's point
// inserted costs the driver 40 s more (well inside the detour allowance).
vi.mock('../../../lib/routing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/routing.js')>();
  return {
    ...actual,
    getRoute: vi.fn(async (_o: unknown, _d: unknown, waypoints: unknown[] = []) => ({
      polyline: '',
      distanceM: 20000,
      durationSec: 1500 + (waypoints.length > 0 ? 40 : 0),
      isEstimate: false,
    })),
    nearestRoad: vi.fn(async () => {
      throw new Error('an area must never be road-snapped');
    }),
  };
});

const { addCustomStop } = await import('../stop-candidates.service.js');
const { createBooking } = await import('../../bookings/bookings.service.js');

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

const ROUTE = [
  { lat: 36.812, lng: 10.115 },
  { lat: 36.795, lng: 10.113 },
  { lat: 36.765, lng: 10.12 },
  { lat: 36.745, lng: 10.17 },
  { lat: 36.73, lng: 10.21 },
];

describe('driver areas and meeting points in bookings (Phase 14 Track D)', () => {
  const db = getDatabase();
  const base = Date.now() % 10_000_000;
  const sourceRef = `osm:node/area-test-${base}`;
  let driverUserId: string;
  let riderIds: string[] = [];
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;
  let meetingPointId: string;

  beforeAll(async () => {
    const [driver] = await db.insert(users).values({ phone: `+21698${base}`, fullName: 'Area Driver' }).returning();
    driverUserId = driver!.id;
    const riders = await db
      .insert(users)
      .values([1, 2, 3].map((n) => ({ phone: `+2169${n}${base}`, fullName: `Area Rider ${n}` })))
      .returning();
    riderIds = riders.map((r) => r.id);
    const [profile] = await db.insert(driverProfiles).values({ userId: driverUserId, verificationStatus: 'approved' }).returning();
    driverProfileId = profile!.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId, make: 'Test', model: 'Car', color: 'Grey', plateNumber: `AREA-${base}`, seatCount: 4 })
      .returning();
    vehicleId = vehicle!.id;
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Ksar Said',
        originLat: ROUTE[0]!.lat,
        originLng: ROUTE[0]!.lng,
        destinationLabel: 'El Mourouj',
        destinationLat: ROUTE[4]!.lat,
        destinationLng: ROUTE[4]!.lng,
        departureAt: new Date(Date.now() + 26 * 3_600_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 3,
        status: 'published',
        routePolyline: encodePolyline(ROUTE),
        estimatedDurationSec: 1500,
      })
      .returning();
    rideId = ride!.id;
    const [point] = await db
      .insert(meetingPoints)
      .values({ kind: 'fuel_station', label: 'Station Total', lat: 36.7652, lng: 10.1207, sourceRef, roadSnapped: true })
      .returning();
    meetingPointId = point!.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(bookings).where(eq(bookings.rideId, rideId));
    await db.delete(routeStops).where(eq(routeStops.rideId, rideId));
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(meetingPoints).where(eq(meetingPoints.sourceRef, sourceRef));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(inArray(users.id, [driverUserId, ...riderIds]));
    await closeQueue();
    await closeDatabase();
  });

  it("saves an 'area' stop with a radius, never road-snapped", async () => {
    const area = await addCustomStop(db, rideId, driverUserId, { label: 'Sidi Hassine', lat: 36.766, lng: 10.112, role: 'area' });
    expect(area).toMatchObject({ kind: 'area', isDriverSelected: true, lat: 36.766, lng: 10.112 });
    // The route is ~14 km: a commute-sized neighbourhood radius.
    expect(area.radiusM).toBe(1500);
  });

  it('refuses an area as a pickup stop', async () => {
    const area = await db.query.routeStops.findFirst({ where: eq(routeStops.rideId, rideId) });
    await expect(
      createBooking(db, rideId, riderIds[0]!, { seatsRequested: 1, pickupStopId: area!.id }),
    ).rejects.toThrow(/area the driver passes by/);
  });

  it('records the meeting point a free-form pickup is, and only when the coordinates match', async () => {
    const atStation = await createBooking(db, rideId, riderIds[1]!, {
      seatsRequested: 1,
      pickup: { label: 'Station Total', lat: 36.7652, lng: 10.1207 },
      pickupMeetingPointId: meetingPointId,
    });
    expect(atStation.pickupMeetingPointId).toBe(meetingPointId);

    const elsewhere = await createBooking(db, rideId, riderIds[2]!, {
      seatsRequested: 1,
      pickup: { label: 'Ailleurs', lat: 36.75, lng: 10.16 },
      pickupMeetingPointId: meetingPointId,
    });
    expect(elsewhere.pickupMeetingPointId).toBeNull();
  });
});
