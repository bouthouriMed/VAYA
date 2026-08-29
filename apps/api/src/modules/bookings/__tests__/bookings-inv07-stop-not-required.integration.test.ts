import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides } from '../../../db/schema/index.js';
import { createBooking } from '../bookings.service.js';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-021, EDGE-054,
 * INV-07) — spec §5/§54/§62: "A driver-selected stop is not required for a
 * feasible passenger match."
 *
 * This test refines, rather than blindly confirms, the audit's blanket
 * "route_passthrough hard-requires stops both ends -> INCORRECT" finding.
 * That finding is accurate for `matching.service.ts`'s `route_passthrough`
 * search tier specifically (confirmed live: `scorePassThroughCandidates`
 * does `continue` when `rankedStops.length === 0`, matching.service.ts
 * ~L634) — but INV-07 is a claim about whether a passenger can ultimately
 * be MATCHED AND BOOKED without a driver stop, and `createBooking`'s
 * free-form-pickup branch (bookings.service.ts ~L405-419) is a SEPARATE
 * code path that places NO stop requirement at all on a ride with zero
 * `route_stops` rows — confirmed here as a real, executed, currently-
 * PASSING behavior, not assumed from reading code alone.
 *
 * Net finding (documented in the matrix, not asserted as a full fix):
 * INV-07 holds at the BOOKING layer unconditionally for a zero-stop ride,
 * but the SEARCH layer's `route_passthrough` tier still cannot discover
 * such a ride for a genuinely mid-route request unless `detour_match`
 * (matching.service.ts's OSRM-dependent fallback tier, only tried when
 * every other tier is completely empty) finds it first — which requires a
 * real routing engine reachable (`scoreDetourCandidates` skips any
 * candidate whose routing call comes back `isEstimate: true`, i.e. no real
 * OSRM/Google reachable). This environment's OSRM has no prepared graph
 * (`docker/osrm/prepare.sh` never run, a pre-existing, documented
 * limitation — see docs/tdd_journey_test_report.md), so the search-layer
 * half of this specific claim is a Category E (test-infrastructure gap)
 * here, not exercised live by this file — only the booking-layer half is.
 */
describe('createBooking — a zero-stop ride never requires a driver-selected stop for a feasible booking (INV-07, booking layer)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let zeroStopRideId: string;
  let riderId: string;
  let rider2Id: string;

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'INV07 Test Driver' })
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
        color: 'White',
        plateNumber: `INV07-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    // Deliberately zero route_stops rows — this ride has never had
    // candidate-stop generation run, nor a driver-selected stop of any
    // kind. The spec's claim under test is exactly this shape.
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Tunis',
        originLat: 36.8065,
        originLng: 10.1815,
        destinationLabel: 'Sousse',
        destinationLat: 35.8256,
        destinationLng: 10.6369,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 15,
        status: 'published',
      })
      .returning();
    zeroStopRideId = ride!.id;

    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}2`, fullName: 'INV07 Test Rider' })
      .returning();
    riderId = rider!.id;

    const [rider2] = await db
      .insert(users)
      .values({ phone: `+216${base}3`, fullName: 'INV07 Test Rider 2' })
      .returning();
    rider2Id = rider2!.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.id, zeroStopRideId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(users).where(eq(users.id, riderId));
    await db.delete(users).where(eq(users.id, rider2Id));
    await closeDatabase();
  });

  it('accepts a free-form PICKUP with no stop reference at all and no distance/detour bound applied (dropoff omitted, defaults to the ride\'s own destination)', async () => {
    // An arbitrary point nowhere near either endpoint — if any implicit
    // stop-proximity requirement existed on a zero-stop ride, this is
    // exactly the shape that would trip it. Confirms INV-07 holds here.
    const booking = await createBooking(db, zeroStopRideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Arbitrary mid-route pin', lat: 36.4, lng: 10.61 },
    });

    expect(booking.pickupStopId).toBeNull();
    expect(booking.pickupLabel).toBe('Arbitrary mid-route pin');
    expect(booking.dropoffStopId).toBeNull();
    expect(booking.status).toBe('pending');
  });

  it('a genuine asymmetry: free-form DROPOFF (unlike pickup) is ALWAYS live-detour-validated regardless of stop count, and fails closed when no real route/routing engine is available — real, observed behavior, not a gap in this test', async () => {
    // bookings.service.ts's dropoff branch (~L456-461) calls
    // assertRealDetourWithinAllowance unconditionally — unlike pickup,
    // which only validates when the ride actually has driver-selected
    // stops. This ride has no routePolyline at all (never had route
    // alternatives computed), so the very first check inside
    // assertRealDetourWithinAllowance ("This ride has no route to validate
    // a detour against") rejects it — a real, currently-live edge case:
    // a zero-stop, zero-route-polyline ride can accept a free-form pickup
    // but NOT a free-form dropoff. Documented here as a genuine asymmetry
    // worth a product/engineering decision, not asserted as either
    // correct or incorrect by the spec (which doesn't address this
    // specific combination).
    await expect(
      createBooking(db, zeroStopRideId, rider2Id, {
        seatsRequested: 1,
        pickup: { label: 'Pickup A', lat: 36.4, lng: 10.61 },
        dropoff: { label: 'Dropoff A', lat: 36.0, lng: 10.63 },
      }),
    ).rejects.toThrow(/route to validate|Unable to validate/);
  });
});
