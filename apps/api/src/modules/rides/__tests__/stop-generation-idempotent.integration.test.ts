import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops } from '../../../db/schema/index.js';
import { generateCandidateStopsForRide } from '../stop-candidates.service.js';

/**
 * Regression: whether a ride's stops were "already generated" used to be a
 * Redis marker. With the marker missing (Redis restarted, flushed, expired,
 * full), calling generation again deleted every stop on the ride — the
 * driver's own selected and custom stops included — before regenerating.
 * A ride's route never changes after creation, so existing stops are now
 * always kept, decided from Postgres alone.
 */
describe('stop generation never wipes a ride\'s existing stops', () => {
  const db = getDatabase();
  const userIds: string[] = [];
  let driverProfileId: string;
  let vehicleId: string;
  let driverUserId: string;
  let rideId: string;
  let customStopId: string;

  beforeAll(async () => {
    const base = Math.floor(Math.random() * 1_000_000_000);
    const [driver] = await db.insert(users).values({ phone: `+216${base}1`, fullName: 'Stops Driver' }).returning();
    driverUserId = driver!.id;
    userIds.push(driverUserId);
    const [profile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    driverProfileId = profile!.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId, make: 'Test', model: 'Car', color: 'Red', plateNumber: `STP-${base}`, seatCount: 4 })
      .returning();
    vehicleId = vehicle!.id;
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Cité Tahrir',
        originLat: 36.826,
        originLng: 10.14,
        destinationLabel: 'La Marsa',
        destinationLat: 36.878,
        destinationLng: 10.324,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 4,
        status: 'draft',
        routePolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      })
      .returning();
    rideId = ride!.id;
    const [stop] = await db
      .insert(routeStops)
      .values({ rideId, sequence: 0, label: 'Lac 2 — custom', lat: 36.851, lng: 10.272, isDriverSelected: true })
      .returning();
    customStopId = stop!.id;
  });

  afterAll(async () => {
    await db.delete(routeStops).where(eq(routeStops.rideId, rideId));
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(inArray(users.id, userIds));
    await closeDatabase();
  });

  it('returns the existing stops untouched, every time it is called', async () => {
    for (let call = 0; call < 2; call++) {
      const result = await generateCandidateStopsForRide(db, rideId, driverUserId);
      expect(result.regenerated).toBe(false);
      expect(result.stops.map((s) => s.id)).toEqual([customStopId]);
    }
    const stillThere = await db.query.routeStops.findFirst({ where: eq(routeStops.id, customStopId) });
    expect(stillThere?.isDriverSelected).toBe(true);
  });
});
