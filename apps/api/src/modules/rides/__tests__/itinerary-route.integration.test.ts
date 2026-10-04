import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, bookings } from '../../../db/schema/index.js';
import { getRideItineraryRoute } from '../itinerary-route.service.js';

/**
 * GET /rides/:rideId/itinerary-route's service, against real Postgres. The
 * reported bug: "expand to see on map" showed only origin and destination,
 * no route — the maps drew only `rides.routePolyline`, which is null for a
 * ride published while routing was unreachable, and which never passes
 * through a passenger picked up beside it. These fixtures deliberately use
 * a ride with NO stored polyline (the failing case).
 */
const CITE_TAHRIR = { lat: 36.826, lng: 10.14 };
const MENZAH_6 = { lat: 36.848, lng: 10.172 };
const LAC_2 = { lat: 36.851, lng: 10.272 };
const LA_MARSA = { lat: 36.878, lng: 10.324 };

describe('itinerary-route.service — the trip map itinerary for driver and passenger', () => {
  const db = getDatabase();
  const userIds: string[] = [];
  let driverProfileId: string;
  let vehicleId: string;
  let driverUserId: string;
  let riderId: string;
  let strangerId: string;
  let rideId: string;
  let emptyRideId: string;

  beforeAll(async () => {
    const base = Math.floor(Math.random() * 1_000_000_000);
    const mkUser = async (n: number, name: string) => {
      const [u] = await db.insert(users).values({ phone: `+216${base}${n}`, fullName: name }).returning();
      userIds.push(u!.id);
      return u!.id;
    };
    driverUserId = await mkUser(1, 'Itinerary Driver');
    riderId = await mkUser(2, 'Itinerary Rider');
    strangerId = await mkUser(3, 'Itinerary Stranger');
    const [profile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    driverProfileId = profile!.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId, make: 'Test', model: 'Car', color: 'Blue', plateNumber: `ITN-${base}`, seatCount: 4 })
      .returning();
    vehicleId = vehicle!.id;

    const rideValues = {
      driverProfileId,
      vehicleId,
      originLabel: 'Cité Tahrir',
      originLat: CITE_TAHRIR.lat,
      originLng: CITE_TAHRIR.lng,
      destinationLabel: 'La Marsa',
      destinationLat: LA_MARSA.lat,
      destinationLng: LA_MARSA.lng,
      departureAt: new Date(Date.now() + 3_600_000),
      seatsTotal: 3,
      seatsAvailable: 2,
      contributionPerSeat: 4,
      status: 'published' as const,
      routePolyline: null, // Published while routing was unreachable.
    };
    const [ride] = await db.insert(rides).values(rideValues).returning();
    rideId = ride!.id;
    const [emptyRide] = await db.insert(rides).values(rideValues).returning();
    emptyRideId = emptyRide!.id;

    await db.insert(bookings).values({
      rideId,
      riderId,
      seatsRequested: 1,
      contributionTotal: 4,
      status: 'accepted',
      pickupLabel: 'Menzah 6',
      pickupLat: MENZAH_6.lat,
      pickupLng: MENZAH_6.lng,
      dropoffLabel: 'Lac 2',
      dropoffLat: LAC_2.lat,
      dropoffLng: LAC_2.lng,
    });
  });

  afterAll(async () => {
    await db.delete(bookings).where(inArray(bookings.rideId, [rideId, emptyRideId]));
    await db.delete(rides).where(inArray(rides.id, [rideId, emptyRideId]));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(inArray(users.id, userIds));
    await closeDatabase();
  });

  it("the driver's itinerary runs origin -> passenger pickup -> passenger dropoff -> destination", async () => {
    const result = await getRideItineraryRoute(db, rideId, driverUserId);
    expect(result.points).toEqual([CITE_TAHRIR, MENZAH_6, LAC_2, LA_MARSA]);
    // With a routing engine reachable this is the real road polyline;
    // without one it is honestly null + isEstimate, never a fake road.
    if (result.isEstimate) expect(result.polyline).toBeNull();
    else expect(result.polyline).toBeTruthy();
  });

  it("a driver without passengers still gets their own trip's itinerary, even with no stored route", async () => {
    const result = await getRideItineraryRoute(db, emptyRideId, driverUserId);
    expect(result.points).toEqual([CITE_TAHRIR, LA_MARSA]);
  });

  it('a passenger gets only their own pickup -> dropoff leg', async () => {
    const result = await getRideItineraryRoute(db, rideId, riderId);
    expect(result.points).toEqual([MENZAH_6, LAC_2]);
  });

  it('someone with no part in the ride is refused', async () => {
    await expect(getRideItineraryRoute(db, rideId, strangerId)).rejects.toThrow(/driver or a passenger/);
  });
});
