import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, inArray, like } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { meetingPoints, users, driverProfiles, vehicles, rides } from '../../../db/schema/index.js';
import { upsertRouteGeometry } from '../../../lib/spatial.js';
import { closeQueue } from '../../../lib/queue.js';

// Ksar Said -> Sidi Hassine -> El Mourouj, simplified.
const ROUTE = [
  { lat: 36.812, lng: 10.115 },
  { lat: 36.795, lng: 10.113 },
  { lat: 36.765, lng: 10.12 },
  { lat: 36.745, lng: 10.17 },
  { lat: 36.73, lng: 10.21 },
];
const TAG = `vaya-test-${Date.now()}`;

// OpenStreetMap and the road-snapping engine are the only fakes.
vi.mock('../../../lib/overpass.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/overpass.js')>();
  return {
    ...actual,
    queryRoadsidePlacesInBbox: vi.fn(async () => [
      // Right by the road at Sidi Hassine.
      { ref: `node/${TAG}-1`, lat: 36.7652, lng: 10.1207, tags: { amenity: 'fuel', brand: 'Total' } },
      // 1.2 km off the route: not a meeting point for this ride.
      { ref: `node/${TAG}-2`, lat: 36.766, lng: 10.105, tags: { amenity: 'fuel', brand: 'Agil' } },
      // Not a meeting point at all.
      { ref: `node/${TAG}-3`, lat: 36.7651, lng: 10.1206, tags: { amenity: 'cafe' } },
    ]),
  };
});
vi.mock('../../../lib/routing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/routing.js')>();
  return {
    ...actual,
    nearestRoad: vi.fn(async (p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng + 0.0001, name: '', snapDistanceM: 9 })),
  };
});

const { scanMeetingPointsAlongRoute } = await import('../meeting-points.service.js');
const { searchRides } = await import('../../matching/matching.service.js');

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

describe('meeting points — collected along a route, then used by search (Phase 14 Track D)', () => {
  const db = getDatabase();
  const polyline = encodePolyline(ROUTE);
  const base = Date.now() % 10_000_000;
  const departure = new Date(Date.now() + 26 * 3_600_000);
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;

  beforeAll(async () => {
    const [driver] = await db.insert(users).values({ phone: `+21697${base}`, fullName: 'Meeting Point Driver' }).returning();
    driverUserId = driver!.id;
    const [profile] = await db.insert(driverProfiles).values({ userId: driverUserId, verificationStatus: 'approved' }).returning();
    driverProfileId = profile!.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId, make: 'Test', model: 'Car', color: 'Grey', plateNumber: `MP-${base}`, seatCount: 4 })
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
        departureAt: departure,
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 3,
        status: 'published',
        routePolyline: polyline,
        estimatedDurationSec: 1500,
      })
      .returning();
    rideId = ride!.id;
    await upsertRouteGeometry(db, rideId, polyline);
  }, 30_000);

  afterAll(async () => {
    await db.delete(meetingPoints).where(like(meetingPoints.sourceRef, `osm:node/${TAG}%`));
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(inArray(users.id, [driverUserId]));
    await closeQueue();
    await closeDatabase();
  });

  it('saves only places by the route that are meeting points, snapped to the road', async () => {
    const result = await scanMeetingPointsAlongRoute(db, polyline);
    expect(result.saved).toBe(1);
    const rows = await db.query.meetingPoints.findMany({ where: like(meetingPoints.sourceRef, `osm:node/${TAG}%`) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'fuel_station', label: 'Station Total', roadSnapped: true });
  });

  it('a re-scan refreshes the point without resetting what VAYA learned', async () => {
    await db.update(meetingPoints).set({ usageCount: 7 }).where(eq(meetingPoints.sourceRef, `osm:node/${TAG}-1`));
    await scanMeetingPointsAlongRoute(db, polyline);
    const rows = await db.query.meetingPoints.findMany({ where: like(meetingPoints.sourceRef, `osm:node/${TAG}%`) });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.usageCount).toBe(7);
  });

  it('a Sidi Hassine -> El Mourouj search boards the passenger at that petrol station', async () => {
    const result = await searchRides(db, {
      originLat: 36.766,
      originLng: 10.112,
      destinationLat: 36.7305,
      destinationLng: 10.2095,
      when: departure,
    });
    const match = result.candidates.find((c) => c.rideId === rideId);
    expect(match).toBeDefined();
    expect(match!.pickupPoint).toMatchObject({ label: 'Station Total', placeKind: 'fuel_station' });
    expect(match!.pickupPoint!.meetingPointId).toBeTruthy();
  });
});
