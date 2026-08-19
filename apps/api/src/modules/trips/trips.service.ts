import { eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import {
  bookings,
  driverProfiles,
  ratings,
  rides,
  riderProfiles,
  trips,
} from '../../db/schema/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { canTransitionTripStatus, isWithinRatingWindow } from '@vaya/domain';
import { notifyBestEffort } from '../notifications/notifications.service.js';

type Database = ReturnType<typeof getDatabase>;

async function getTripWithPartiesOrThrow(db: Database, tripId: string) {
  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, tripId),
    with: { booking: { with: { ride: { with: { driverProfile: true } } } } },
  });
  if (!trip) throw new NotFoundError('Trip');
  return trip;
}

function assertIsParty(
  trip: Awaited<ReturnType<typeof getTripWithPartiesOrThrow>>,
  userId: string,
): void {
  const isRider = trip.booking.riderId === userId;
  const isDriver = trip.booking.ride.driverProfile.userId === userId;
  if (!isRider && !isDriver) {
    throw new ForbiddenError('Not authorized to access this trip');
  }
}

export async function getTripByBookingId(db: Database, bookingId: string, requestingUserId: string) {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: { ride: { with: { driverProfile: true } }, trip: true },
  });
  if (!booking) throw new NotFoundError('Booking');

  const isRider = booking.riderId === requestingUserId;
  const isDriver = booking.ride.driverProfile.userId === requestingUserId;
  if (!isRider && !isDriver) {
    throw new ForbiddenError('Not authorized to access this trip');
  }
  if (!booking.trip) throw new NotFoundError('Trip');
  return booking.trip;
}

/**
 * Recomputes a completed-trip count directly from `trips` (not an
 * incremented counter) for the driver and rider on one trip — the same
 * "recompute from source of truth" discipline as
 * packages/domain/src/rating/rating-aggregate.ts's rating aggregation,
 * applied to trip volume instead of rating scores. Fixes a real, separate
 * gap Phase 9 found: `tripCount` on `driver_profiles` (and now
 * `rider_profiles`) was previously written only by apps/api/src/db/seed.ts
 * and never updated by any real trip completing — trust-tier computation
 * needs a real, live number here.
 */
async function refreshTripCounts(
  db: Database,
  driverProfileId: string,
  riderId: string,
): Promise<void> {
  const driverRides = await db.query.rides.findMany({
    where: eq(rides.driverProfileId, driverProfileId),
    with: { bookings: { with: { trip: true } } },
  });
  const driverTripCount = driverRides.reduce(
    (count, ride) =>
      count + ride.bookings.filter((b) => b.trip?.status === 'completed').length,
    0,
  );

  const riderBookings = await db.query.bookings.findMany({
    where: eq(bookings.riderId, riderId),
    with: { trip: true },
  });
  const riderTripCount = riderBookings.filter((b) => b.trip?.status === 'completed').length;

  await db
    .update(driverProfiles)
    .set({ tripCount: driverTripCount, updatedAt: new Date() })
    .where(eq(driverProfiles.id, driverProfileId));

  const existingRiderProfile = await db.query.riderProfiles.findFirst({
    where: eq(riderProfiles.userId, riderId),
  });
  if (existingRiderProfile) {
    await db
      .update(riderProfiles)
      .set({ tripCount: riderTripCount, updatedAt: new Date() })
      .where(eq(riderProfiles.id, existingRiderProfile.id));
  } else {
    await db.insert(riderProfiles).values({ userId: riderId, tripCount: riderTripCount });
  }
}

/**
 * `POST /trips/:id/complete` — the minimal trip-completion trigger Phase 9
 * needs (docs/roadmap/phase-09-ratings-trust.md's rating prompt fires off
 * `trips.status` reaching `completed`, and no code path anywhere in this
 * codebase ever produced that transition before this endpoint existed —
 * verified directly: no caller of `canTransitionTripStatus` existed outside
 * packages/domain's own tests prior to this phase).
 *
 * Deliberately callable by *either* trip party (rider or driver), not
 * driver-only as a literal reading of the phase doc's "callable by the
 * driver" might suggest: this mobile app has no driver-side trip-execution
 * screen at all yet (drivers only manage rides at the publish/cancel level
 * — docs/product/audit.md's gap, not something this phase builds). The
 * existing passenger-side flow (bookings/pending -> pickup -> live ->
 * settlement) is the only place a trip's real end is ever witnessed today,
 * so restricting this to driver-only would leave it uncallable from any
 * real screen. This mirrors an existing precedent in this exact codebase:
 * bookings.service.ts's cancelBooking already lets either party trigger a
 * status transition.
 */
export async function completeTrip(db: Database, tripId: string, requestingUserId: string) {
  const trip = await getTripWithPartiesOrThrow(db, tripId);
  assertIsParty(trip, requestingUserId);

  if (!canTransitionTripStatus(trip.status, 'completed')) {
    throw new ConflictError(`Cannot complete a trip in status "${trip.status}"`);
  }

  const completedAt = new Date();
  const [updated] = await db
    .update(trips)
    .set({ status: 'completed', completedAt, updatedAt: completedAt })
    .where(eq(trips.id, tripId))
    .returning();
  if (!updated) throw new Error('Failed to complete trip');

  // The booking itself also models a `completed` status
  // (packages/domain/src/booking/booking-status.ts's `accepted -> completed`
  // edge) that nothing was ever setting either — keep the two in lockstep
  // so `bookings/mine` and (tabs)/trips.tsx stop showing "Confirmé" forever
  // after a trip actually finished.
  await db
    .update(bookings)
    .set({ status: 'completed', updatedAt: completedAt })
    .where(eq(bookings.id, trip.bookingId));

  const driverUserId = trip.booking.ride.driverProfile.userId;
  const riderId = trip.booking.riderId;

  await refreshTripCounts(db, trip.booking.ride.driverProfileId, riderId);

  // Phase 7/8 pattern: extend the existing dispatch mechanism with a new
  // trigger point rather than build a second one. `trip_completed` already
  // existed as a schema-only event type
  // (apps/api/src/db/schema/notifications.schema.ts) with nothing
  // populating it — this is that trigger, reused for "your trip is over,
  // please rate" rather than minting a distinct `rating_prompted` event
  // type, per the phase doc's explicit "reuse trip_completed if that event
  // type already exists" option.
  await notifyBestEffort(db, driverUserId, 'trip_completed', { tripId, bookingId: trip.bookingId });
  await notifyBestEffort(db, riderId, 'trip_completed', { tripId, bookingId: trip.bookingId });

  return updated;
}

interface PendingRatingCandidate {
  tripId: string;
  role: 'rider_rates_driver' | 'driver_rates_rider';
  counterpartName: string | null;
  completedAt: Date;
}

/**
 * The single most-recently-completed trip this user is a party to, still
 * within the 24h rating window, that they haven't rated yet — or `null`.
 * Backs the mobile "re-surface once on next app open if unsubmitted"
 * behavior (docs/roadmap/phase-09-ratings-trust.md's UX behavior section):
 * a lightweight poll-on-launch endpoint rather than a stateful
 * "already-shown" flag, since there's no local-notification-scheduling
 * infrastructure in this codebase to hang that off of.
 */
export async function getPendingRatingForUser(
  db: Database,
  userId: string,
): Promise<PendingRatingCandidate | null> {
  const now = new Date();
  const candidates: PendingRatingCandidate[] = [];

  const asRiderBookings = await db.query.bookings.findMany({
    where: eq(bookings.riderId, userId),
    with: { trip: true, ride: { with: { driverProfile: { with: { user: true } } } } },
  });
  for (const booking of asRiderBookings) {
    const trip = booking.trip;
    if (!trip || trip.status !== 'completed' || !trip.completedAt) continue;
    if (!isWithinRatingWindow(trip.completedAt, now)) continue;
    candidates.push({
      tripId: trip.id,
      role: 'rider_rates_driver',
      counterpartName: booking.ride.driverProfile.user?.fullName ?? null,
      completedAt: trip.completedAt,
    });
  }

  const driverProfile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, userId),
  });
  if (driverProfile) {
    const driverRides = await db.query.rides.findMany({
      where: eq(rides.driverProfileId, driverProfile.id),
      with: { bookings: { with: { trip: true, rider: true } } },
    });
    for (const ride of driverRides) {
      for (const booking of ride.bookings) {
        const trip = booking.trip;
        if (!trip || trip.status !== 'completed' || !trip.completedAt) continue;
        if (!isWithinRatingWindow(trip.completedAt, now)) continue;
        candidates.push({
          tripId: trip.id,
          role: 'driver_rates_rider',
          counterpartName: booking.rider?.fullName ?? null,
          completedAt: trip.completedAt,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  const alreadyRated = await db.query.ratings.findMany({ where: eq(ratings.raterUserId, userId) });
  const ratedTripIds = new Set(alreadyRated.map((r) => r.tripId));

  const unratedSorted = candidates
    .filter((c) => !ratedTripIds.has(c.tripId))
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  return unratedSorted[0] ?? null;
}
