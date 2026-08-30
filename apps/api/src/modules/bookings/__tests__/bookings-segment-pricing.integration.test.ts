import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, routeStops } from '../../../db/schema/index.js';
import { createBooking } from '../bookings.service.js';
import { getRoute } from '../../../lib/routing.js';
import { computeSuggestedPrice, DEFAULT_PRICING_CONFIG } from '@vaya/domain';

/**
 * Journey-contract second pass (docs/unified_driver_and_passenger_journey.md
 * §24, M-070..075, EDGE-055) — real Postgres, real routing layer (OSRM when
 * reachable, the same production haversine fallback otherwise — never a
 * test-only stand-in, matching this codebase's own established discipline).
 * Confirmed live (this pass, before the fix) that this was the exact,
 * previously-undocumented-by-a-real-test gap `journey-2-mid-route.api.test.ts`
 * and `journey-3-early-segment.api.test.ts` caught: `contributionTotal` was
 * always `ride.contributionPerSeat * seatsRequested`, regardless of what
 * segment was actually requested.
 */
describe('bookings.service — segment-aware pricing (M-070..075)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;
  let midStopId: string;
  let simpleRideId: string; // zero-stop ride, for the full-route test only
  let rideContributionPerSeat: number;
  const riderIds: string[] = [];

  async function makeRider(suffix: string) {
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${Date.now() % 10_000_000}${suffix}`, fullName: `Pricing Rider ${suffix}` })
      .returning();
    riderIds.push(rider!.id);
    return rider!.id;
  }

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}6`, fullName: 'Segment Pricing Test Driver' })
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
        color: 'Blue',
        plateNumber: `SEGPRICE-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    // A real, long, non-trivial intercity-scale corridor (Tunis -> Sousse,
    // ~140km real driving distance) so a strict sub-segment's real
    // distance/duration is genuinely, meaningfully smaller than the full
    // route's — a short hop's floor-clamped price could otherwise mask a
    // real wiring bug. A real routePolyline is computed up front (OSRM when
    // reachable, this environment's real haversine fallback otherwise,
    // never a test-only stand-in) — createBooking's free-form-pickup path
    // requires one to run its live detour check at all.
    const tunis = { lat: 36.8065, lng: 10.1815 };
    const sousse = { lat: 35.8256, lng: 10.6369 };
    const route = await getRoute(tunis, sousse);

    // Real bug found and fixed while re-verifying this suite against real
    // Google-routed distances (this fixture previously hardcoded 25, a
    // value with no relationship to the route's actual ~140km length): a
    // driver's advertised full-route price only stays a meaningful upper
    // bound for M-070's "segment < full route" assertion if it's derived
    // from the SAME real formula computeBookingContributionTotal itself
    // uses for a segment — createBooking's full-route branch returns
    // `ride.contributionPerSeat` verbatim (bookings.service.ts's own
    // documented shortcut), so an unrealistically low, hand-picked fixture
    // price made a real, correctly-computed sub-segment price look "too
    // expensive" by comparison, when the actual bug would have been the
    // reverse. Mirrors this codebase's own established seed.ts principle
    // ("pricing is entirely formula-derived from real OSRM geometry, not
    // hand-typed — one source of truth").
    rideContributionPerSeat = computeSuggestedPrice(
      route.distanceM / 1000,
      route.durationSec / 60,
      DEFAULT_PRICING_CONFIG,
      { isEstimate: route.isEstimate },
    ).recommended;
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
        departureAt: new Date(Date.now() + 6 * 60 * 60_000),
        // Generously sized — this suite is testing pricing, not capacity,
        // and every test below books an overlapping span on the same ride
        // (full-route and every mid-segment booking share the whole
        // downstream corridor), so seatsTotal just needs headroom.
        seatsTotal: 10,
        seatsAvailable: 10,
        contributionPerSeat: rideContributionPerSeat,
        status: 'published',
        routePolyline: route.polyline,
        estimatedDurationSec: route.durationSec,
      })
      .returning();
    rideId = ride!.id;

    // A real, roughly-midway driver-selected stop (Hammamet).
    const [midStop] = await db
      .insert(routeStops)
      .values({
        rideId,
        sequence: 0,
        label: 'Hammamet',
        lat: 36.4,
        lng: 10.61,
        roadSnapped: true,
        isDriverSelected: true,
      })
      .returning();
    midStopId = midStop!.id;

    // A separate, zero-stop ride for the full-route test below — a
    // free-form pickup on a ride WITH stops always runs a live detour
    // check requiring a real (non-empty) routePolyline, which this
    // environment's haversine fallback deliberately never produces
    // (lib/routing.ts's fallbackRoute — matches real production behavior
    // when OSRM is unreachable, not a test gap to route around). A
    // zero-stop ride's free-form pickup skips that check entirely
    // (bookings.service.ts's own documented, pre-existing behavior), so
    // this is the correct fixture for "full route, no genuine segment"
    // rather than a workaround.
    const [simpleRide] = await db
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
        departureAt: new Date(Date.now() + 6 * 60 * 60_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: rideContributionPerSeat,
        status: 'published',
      })
      .returning();
    simpleRideId = simpleRide!.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.driverProfileId, driverProfileId));
    for (const riderId of riderIds) {
      await db.delete(users).where(eq(users.id, riderId));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await closeDatabase();
  });

  it('M-071: a full-route booking (the ride\'s own origin -> destination, submitted verbatim) still pays exactly the ride\'s advertised price', async () => {
    const rider = await makeRider('full');
    const booking = await createBooking(db, simpleRideId, rider, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: 36.8065, lng: 10.1815 },
    });

    expect(booking.contributionTotal).toBe(rideContributionPerSeat * 1);
  }, 15_000);

  it('M-070: a strict sub-segment (Hammamet stop -> the ride\'s own destination) prices strictly below the full-route price', async () => {
    const rider = await makeRider('mid');
    const fullRoutePrice = rideContributionPerSeat;

    const booking = await createBooking(db, rideId, rider, {
      seatsRequested: 1,
      pickupStopId: midStopId,
    });

    expect(booking.contributionTotal).toBeGreaterThan(0);
    expect(booking.contributionTotal).toBeLessThan(fullRoutePrice);
    // Never the flat full-route price re-applied verbatim — the real bug
    // this test exists to catch.
    expect(booking.contributionTotal).not.toBe(fullRoutePrice);
  }, 15_000);

  it('M-074: sequential turnover — recomputing the same segment for a different passenger is deterministic, not affected by other bookings existing', async () => {
    const riderA = await makeRider('seqA');
    const riderB = await makeRider('seqB');

    const bookingA = await createBooking(db, rideId, riderA, {
      seatsRequested: 1,
      pickupStopId: midStopId,
    });
    const bookingB = await createBooking(db, rideId, riderB, {
      seatsRequested: 1,
      pickupStopId: midStopId,
    });

    expect(bookingB.contributionTotal).toBe(bookingA.contributionTotal);
  }, 20_000);

  it('EDGE-055: a 2-seat request on the same sub-segment prices as 2x the per-seat segment price, not the full-route per-seat price', async () => {
    const rider = await makeRider('2seat');
    const oneSeat = await createBooking(db, rideId, await makeRider('2ref'), {
      seatsRequested: 1,
      pickupStopId: midStopId,
    });

    const twoSeats = await createBooking(db, rideId, rider, {
      seatsRequested: 2,
      pickupStopId: midStopId,
    });

    expect(twoSeats.contributionTotal).toBeCloseTo(oneSeat.contributionTotal * 2, 5);
  }, 20_000);
});
