import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import {
  users,
  driverProfiles,
  riderProfiles,
  vehicles,
  rides,
  bookings,
  trips,
  ratings,
  notifications,
} from '../../../db/schema/index.js';
import {
  createBooking,
  acceptBooking,
  cancelBooking,
  previewBookingCancellation,
  reportNoShow,
} from '../bookings.service.js';
import { startTrip } from '../../trips/trips.service.js';
import { ConflictError, ForbiddenError, ValidationError } from '../../../lib/errors.js';

/**
 * Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md) — real Postgres,
 * same discipline as Phase 1's bookings.service.test.ts (the
 * seat-accounting race-condition suite this phase's own cancellation path
 * must be equally safe against) and Phase 7's bookings-notifications
 * integration test. Covers: the full cancel flow end-to-end (status,
 * notification, reputation penalty, atomic seat release), a concurrent
 * double-cancel race proving the new status-guard fix actually holds, and
 * the no-show minimum-time-past-departure business rule.
 */
describe('bookings.service — cancellation & no-show (Phase 10)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  const riderIds: string[] = [];

  async function makeRide(departureAt: Date, seatsTotal = 2) {
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Test Origin',
        originLat: 36.8,
        originLng: 10.18,
        destinationLabel: 'Test Destination',
        destinationLat: 36.85,
        destinationLng: 10.2,
        departureAt,
        seatsTotal,
        seatsAvailable: seatsTotal,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    return ride!;
  }

  async function makeRider(suffix: string) {
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${Date.now() % 10_000_000}${suffix}`, fullName: `Rider ${suffix}` })
      .returning();
    riderIds.push(rider!.id);
    return rider!;
  }

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}9`, fullName: 'Cancel Test Driver' })
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
        color: 'Black',
        plateNumber: `CANCEL-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;
  }, 30_000);

  afterAll(async () => {
    // rides -> bookings/trips -> ratings all cascade-delete (same pattern
    // as the other integration suites in this module); rider users must be
    // deleted only after that cascade clears their bookings.riderId
    // references (that FK has no onDelete cascade of its own).
    await db.delete(rides).where(eq(rides.driverProfileId, driverProfileId));
    for (const riderId of riderIds) {
      await db.delete(users).where(eq(users.id, riderId));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await closeDatabase();
  });

  it('previews a "free" tier well before departure and a "severe" tier just before it', async () => {
    const rider = await makeRider('1');
    const farRide = await makeRide(new Date(Date.now() + 3 * 24 * 60 * 60_000));
    const nearRide = await makeRide(new Date(Date.now() + 5 * 60_000));

    const farBooking = await createBooking(db, farRide.id, rider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: 36.8, lng: 10.18 },
    });
    const nearBooking = await createBooking(db, nearRide.id, rider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: 36.8, lng: 10.18 },
    });

    const farPreview = await previewBookingCancellation(db, farBooking.id, rider.id);
    expect(farPreview.tier).toBe('free');
    expect(farPreview.penaltyPoints).toBe(0);

    const nearPreview = await previewBookingCancellation(db, nearBooking.id, rider.id);
    expect(nearPreview.tier).toBe('severe');
    expect(nearPreview.penaltyPoints).toBeGreaterThan(0);
  });

  it('full cancel flow: status updates, other party notified, reputation penalty applied, seat released atomically', async () => {
    const rider = await makeRider('2');
    // <24h but >30min out -> moderate tier.
    const ride = await makeRide(new Date(Date.now() + 6 * 60 * 60_000), 2);

    const booking = await createBooking(db, ride.id, rider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: 36.8, lng: 10.18 },
    });
    await acceptBooking(db, booking.id, driverUserId);

    const [rideAfterAccept] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(rideAfterAccept!.seatsAvailable).toBe(1);

    const [driverBefore] = await db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.id, driverProfileId));

    const result = await cancelBooking(db, booking.id, rider.id, 'change_of_plans');

    expect(result.booking.status).toBe('cancelled_by_rider');
    expect(result.cancellationPolicy.tier).toBe('moderate');
    expect(result.cancellationPolicy.penaltyPoints).toBeGreaterThan(0);

    // Seat released atomically back to the ride.
    const [rideAfterCancel] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(rideAfterCancel!.seatsAvailable).toBe(2);
    expect(rideAfterCancel!.status).toBe('published');

    // M-110: the reason is real, persisted product data — not discarded
    // after the response is sent.
    const [bookingRow] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(bookingRow!.cancellationReason).toBe('change_of_plans');

    // Trip is terminal.
    const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });
    expect(trip!.status).toBe('cancelled');

    // The *other* party (the driver — the rider cancelled) was notified.
    const notification = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, driverUserId), eq(notifications.type, 'booking_cancelled')),
      orderBy: desc(notifications.createdAt),
    });
    expect(notification).toBeDefined();
    const payload = notification!.payload as Record<string, unknown>;
    expect(payload.cancelledBy).toBe('rider');
    // Email-dispatch gating fields (notifications/email-templates.ts's
    // renderBookingCancelled): this was a confirmed (accepted) booking
    // cancelled by the rider, so the driver is the emailable recipient.
    expect(payload.recipientRole).toBe('driver');
    expect(payload.wasConfirmed).toBe(true);
    // Real bug found live (reported by a user testing a real mid-route
    // booking): this must be the booking's OWN resolved pickup/dropoff, not
    // the ride's raw endpoints — a passenger boarding mid-route must not be
    // shown to the other party as if their journey were the driver's full
    // route.
    expect(payload.originLabel).toBe(booking.pickupLabel);
    expect(payload.destinationLabel).toBe(ride.destinationLabel);

    // Reputation penalty landed on the *cancelling* party (the rider), not the driver.
    const riderProfile = await db.query.riderProfiles.findFirst({
      where: eq(riderProfiles.userId, rider.id),
    });
    expect(riderProfile).toBeDefined();
    expect(riderProfile!.reliabilityPenaltyPoints).toBe(result.cancellationPolicy.penaltyPoints);

    const [driverAfter] = await db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.id, driverProfileId));
    expect(driverAfter!.reliabilityPenaltyPoints).toBe(driverBefore!.reliabilityPenaltyPoints);

    // A second cancel attempt on the now-terminal booking is rejected.
    await expect(cancelBooking(db, booking.id, rider.id, 'change_of_plans')).rejects.toBeInstanceOf(ConflictError);
  });

  it('only lets one of two concurrent cancel attempts on the same booking win, without double-crediting the seat', async () => {
    const rider = await makeRider('3');
    const ride = await makeRide(new Date(Date.now() + 6 * 60 * 60_000), 3);

    const booking = await createBooking(db, ride.id, rider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: 36.8, lng: 10.18 },
    });
    await acceptBooking(db, booking.id, driverUserId);

    const [rideAfterAccept] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(rideAfterAccept!.seatsAvailable).toBe(2);

    // Both the rider and the driver race to cancel the same booking at once.
    const results = await Promise.allSettled([
      cancelBooking(db, booking.id, rider.id, 'change_of_plans'),
      cancelBooking(db, booking.id, driverUserId, 'change_of_plans'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    // Exactly one seat was released — not two. This is the exact bug class
    // the status-guard fix (bookings.service.ts's cancelBooking) closes: an
    // unguarded UPDATE ... WHERE id = :id would let both concurrent calls
    // pass their stale canTransitionBookingStatus check and each restore a
    // seat, double-crediting seatsAvailable.
    const [rideAfterCancel] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(rideAfterCancel!.seatsAvailable).toBe(3);
    expect(rideAfterCancel!.seatsAvailable).toBeLessThanOrEqual(rideAfterCancel!.seatsTotal);
  });

  it('rejects cancellation (and its preview) once the trip has actually started, for both rider and driver', async () => {
    const rider = await makeRider('6');
    const ride = await makeRide(new Date(Date.now() + 6 * 60 * 60_000), 2);

    const booking = await createBooking(db, ride.id, rider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: 36.8, lng: 10.18 },
    });
    await acceptBooking(db, booking.id, driverUserId);

    const tripBeforeStart = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });
    expect(tripBeforeStart!.status).toBe('scheduled');

    // Still scheduled — both the preview and the real cancel work normally.
    await expect(previewBookingCancellation(db, booking.id, rider.id)).resolves.toBeDefined();

    await startTrip(db, tripBeforeStart!.id, driverUserId);

    // Once genuinely underway, neither party can cancel through this path
    // anymore — a driver_approaching+ trip needs completion or a no-show
    // report, not a cancellation.
    await expect(previewBookingCancellation(db, booking.id, rider.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(cancelBooking(db, booking.id, rider.id, 'change_of_plans')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cancelBooking(db, booking.id, driverUserId, 'change_of_plans')).rejects.toBeInstanceOf(ForbiddenError);

    // The booking is untouched — still accepted, seat still held.
    const stillAccepted = await db.query.bookings.findFirst({ where: eq(bookings.id, booking.id) });
    expect(stillAccepted!.status).toBe('accepted');
    const [rideAfter] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(rideAfter!.seatsAvailable).toBe(1);
  });

  it('M-110: rejects a cancellation whose reason is not one of the fixed set — enforced at the service layer, not just the HTTP route schema', async () => {
    const rider = await makeRider('4b');
    const ride = await makeRide(new Date(Date.now() + 6 * 60 * 60_000), 2);
    const booking = await createBooking(db, ride.id, rider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: 36.8, lng: 10.18 },
    });

    // @ts-expect-error deliberately calling with a reason outside the fixed
    // set, to prove a direct service-level caller can't bypass M-110 either.
    await expect(cancelBooking(db, booking.id, rider.id, 'not_a_real_reason')).rejects.toBeInstanceOf(
      ValidationError,
    );

    // Untouched — the rejected attempt had no side effect.
    const stillPending = await db.query.bookings.findFirst({ where: eq(bookings.id, booking.id) });
    expect(stillPending!.status).toBe('pending');
  });

  it('rejects reporting a no-show before the scheduled departure time', async () => {
    const rider = await makeRider('4');
    const ride = await makeRide(new Date(Date.now() + 60 * 60_000));

    const booking = await createBooking(db, ride.id, rider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: 36.8, lng: 10.18 },
    });
    await acceptBooking(db, booking.id, driverUserId);

    await expect(reportNoShow(db, booking.id, rider.id)).rejects.toBeInstanceOf(ConflictError);

    const stillAccepted = await db.query.bookings.findFirst({ where: eq(bookings.id, booking.id) });
    expect(stillAccepted!.status).toBe('accepted');
  });

  it('reporting a no-show after departure updates status, releases the seat, applies the automatic low rating, and notifies the reported party', async () => {
    const rider = await makeRider('5');
    // Departure already passed, well past the minimum grace buffer.
    const ride = await makeRide(new Date(Date.now() - 60 * 60_000), 1);

    const booking = await createBooking(db, ride.id, rider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: 36.8, lng: 10.18 },
    });
    await acceptBooking(db, booking.id, driverUserId);

    const updated = await reportNoShow(db, booking.id, rider.id);
    expect(updated.status).toBe('no_show');

    const [rideAfter] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(rideAfter!.seatsAvailable).toBe(1);

    const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });
    expect(trip!.status).toBe('no_show');

    // The rider reported the driver -> the driver is the no-show party and
    // gets both the automatic low rating and the reliability penalty.
    const autoRating = await db.query.ratings.findFirst({
      where: and(eq(ratings.tripId, trip!.id), eq(ratings.raterUserId, rider.id)),
    });
    expect(autoRating).toBeDefined();
    expect(autoRating!.rateeUserId).toBe(driverUserId);
    expect(autoRating!.stars).toBe(1);

    const [driverAfter] = await db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.id, driverProfileId));
    expect(driverAfter!.reliabilityPenaltyPoints).toBeGreaterThanOrEqual(5);

    const notification = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.userId, driverUserId),
        eq(notifications.type, 'booking_no_show_reported'),
      ),
      orderBy: desc(notifications.createdAt),
    });
    expect(notification).toBeDefined();
  });
});
