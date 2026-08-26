import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops, bookings } from '../../../db/schema/index.js';
import { previewBookingDetour } from '../bookings.service.js';
import { ForbiddenError } from '../../../lib/errors.js';

/**
 * Real Postgres, same discipline as bookings-pickup-stop.integration.test.ts.
 * Covers the two genuinely different code paths previewBookingDetour takes:
 * a stop-based booking (surfaces the already-stored deviationMeters/Seconds
 * from route_stops, no live routing call) and a free-form booking on a
 * legacy zero-route_stops ride (a real getRoute-based detour computation).
 */
describe('bookings.service — previewBookingDetour', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let riderId: string;
  let rideWithStopsId: string;
  let legacyRideId: string;
  let stopBookingId: string;
  let legacyBookingId: string;

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'Detour Preview Test Driver' })
      .returning();
    driverUserId = driverUser!.id;

    const [driverProfile] = await db.insert(driverProfiles).values({ userId: driverUserId }).returning();
    driverProfileId = driverProfile!.id;

    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId,
        make: 'Test',
        model: 'Car',
        color: 'Blue',
        plateNumber: `DETOUR-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}2`, fullName: 'Detour Preview Test Rider' })
      .returning();
    riderId = rider!.id;

    const [rideWithStops] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Origin',
        originLat: 36.8,
        originLng: 10.18,
        destinationLabel: 'Destination',
        destinationLat: 36.85,
        destinationLng: 10.2,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    rideWithStopsId = rideWithStops!.id;

    const [pickupStop] = await db
      .insert(routeStops)
      .values({
        rideId: rideWithStopsId,
        sequence: 0,
        label: 'Pickup Stop',
        lat: 36.81,
        lng: 10.19,
        roadSnapped: true,
        isDriverSelected: true,
        deviationMeters: 42,
        deviationSeconds: 30,
      })
      .returning();

    const [dropoffStop] = await db
      .insert(routeStops)
      .values({
        rideId: rideWithStopsId,
        sequence: 1,
        label: 'Dropoff Stop',
        lat: 36.83,
        lng: 10.195,
        roadSnapped: true,
        isDriverSelected: true,
        deviationMeters: 17,
        deviationSeconds: 12,
      })
      .returning();

    const [stopBooking] = await db
      .insert(bookings)
      .values({
        rideId: rideWithStopsId,
        riderId,
        seatsRequested: 1,
        contributionTotal: 5,
        status: 'pending',
        pickupStopId: pickupStop!.id,
        pickupLabel: pickupStop!.label,
        pickupLat: pickupStop!.lat,
        pickupLng: pickupStop!.lng,
        dropoffStopId: dropoffStop!.id,
        dropoffLabel: dropoffStop!.label,
        dropoffLat: dropoffStop!.lat,
        dropoffLng: dropoffStop!.lng,
      })
      .returning();
    stopBookingId = stopBooking!.id;

    // Legacy ride: zero route_stops, published-before-Phase-4 shape.
    const [legacyRide] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Legacy Origin',
        originLat: 36.7,
        originLng: 10.1,
        destinationLabel: 'Legacy Destination',
        destinationLat: 36.75,
        destinationLng: 10.15,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    legacyRideId = legacyRide!.id;

    const [legacyBooking] = await db
      .insert(bookings)
      .values({
        rideId: legacyRideId,
        riderId,
        seatsRequested: 1,
        contributionTotal: 5,
        status: 'pending',
        pickupStopId: null,
        pickupLabel: 'Free-form pickup',
        pickupLat: 36.71,
        pickupLng: 10.105,
      })
      .returning();
    legacyBookingId = legacyBooking!.id;
  });

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.id, rideWithStopsId));
    await db.delete(rides).where(eq(rides.id, legacyRideId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(users).where(eq(users.id, riderId));
    await closeDatabase();
  });

  it('surfaces the already-stored deviation for a stop-based pickup/dropoff, marked as planned', async () => {
    const preview = await previewBookingDetour(db, stopBookingId, driverUserId);
    expect(preview.pickup.isPlannedStop).toBe(true);
    expect(preview.pickup.deviationMeters).toBe(42);
    expect(preview.pickup.deviationSeconds).toBe(30);
    expect(preview.pickup.stopIndex).toBe(1);
    expect(preview.pickup.totalStops).toBe(2);
    expect(preview.dropoff.isPlannedStop).toBe(true);
    expect(preview.dropoff.deviationMeters).toBe(17);
    expect(preview.dropoff.stopIndex).toBe(2);
    expect(preview.segment.distanceM).toBeGreaterThan(0);
  });

  it('computes a real live detour for a free-form pickup on a legacy ride, marked as not planned', async () => {
    const preview = await previewBookingDetour(db, legacyBookingId, driverUserId);
    expect(preview.pickup.isPlannedStop).toBe(false);
    expect(preview.pickup.stopIndex).toBeNull();
    expect(preview.pickup.deviationMeters).toBeGreaterThanOrEqual(0);
    expect(preview.pickup.deviationSeconds).toBeGreaterThanOrEqual(0);
    // No dropoff stop chosen -- defaults to the ride's own destination,
    // trivially on-route, zero deviation, never a live computation.
    expect(preview.dropoff.isPlannedStop).toBe(true);
    expect(preview.dropoff.deviationMeters).toBe(0);
    expect(preview.dropoff.lat).toBeCloseTo(36.75, 5);
  });

  it('rejects a rider (or anyone other than the ride\'s own driver) trying to preview a request', async () => {
    await expect(previewBookingDetour(db, stopBookingId, riderId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
