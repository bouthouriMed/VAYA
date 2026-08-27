import { and, eq } from 'drizzle-orm';
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
import {
  canTransitionRideStatus,
  canTransitionTripStatus,
  computeAutoTripStatusTransition,
  deriveTrackingStatus,
  isWithinRatingWindow,
  type TripStatus,
} from '@vaya/domain';
import { notifyBestEffort } from '../notifications/notifications.service.js';
import { publishTripUpdate } from '../../lib/realtime.js';
import { getRoute } from '../../lib/routing.js';
import { getLogger } from '../../config/logger.js';

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

function assertIsDriver(
  trip: Awaited<ReturnType<typeof getTripWithPartiesOrThrow>>,
  userId: string,
): void {
  if (trip.booking.ride.driverProfile.userId !== userId) {
    throw new ForbiddenError('Only the driver can perform this action');
  }
}

function pickupPoint(trip: Awaited<ReturnType<typeof getTripWithPartiesOrThrow>>) {
  return { lat: trip.booking.pickupLat, lng: trip.booking.pickupLng };
}

function destinationPoint(trip: Awaited<ReturnType<typeof getTripWithPartiesOrThrow>>) {
  return trip.booking.dropoffLat != null && trip.booking.dropoffLng != null
    ? { lat: trip.booking.dropoffLat, lng: trip.booking.dropoffLng }
    : { lat: trip.booking.ride.destinationLat, lng: trip.booking.ride.destinationLng };
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

const TERMINAL_TRIP_STATUSES_FOR_RIDE: readonly TripStatus[] = ['completed', 'no_show', 'cancelled'];

/**
 * Live tracking (docs/domain/live-tracking.md): before this feature,
 * `rides.status` reaching `in_progress`/`completed` never actually happened
 * anywhere — the driver ride-hub screen's own `computeTripPhase` treated
 * `in_progress` as a documented departure-time-based *proxy* precisely
 * because nothing real ever set it. Now that a real trip-status state
 * machine exists per booking, the ride's own status can finally reflect
 * reality: the first trip to start flips the ride to `in_progress` (a
 * multi-passenger ride's second/third trip starting sees it already there
 * and no-ops), and the last non-terminal trip completing flips it to
 * `completed`. A ride with zero accepted bookings never transitions here —
 * nothing to start or complete.
 */
async function syncRideStatusOnTripStart(db: Database, rideId: string): Promise<void> {
  const ride = await db.query.rides.findFirst({ where: eq(rides.id, rideId) });
  if (ride && canTransitionRideStatus(ride.status, 'in_progress')) {
    await db
      .update(rides)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(and(eq(rides.id, rideId), eq(rides.status, ride.status)));
  }
}

async function syncRideStatusOnTripComplete(db: Database, rideId: string): Promise<void> {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, rideId),
    with: { bookings: { with: { trip: true } } },
  });
  if (!ride || !canTransitionRideStatus(ride.status, 'completed')) return;

  const bookingsWithATrip = ride.bookings.filter((b) => b.status === 'accepted' || b.status === 'completed');
  const allTripsTerminal =
    bookingsWithATrip.length > 0 &&
    bookingsWithATrip.every((b) => b.trip && TERMINAL_TRIP_STATUSES_FOR_RIDE.includes(b.trip.status));
  if (!allTripsTerminal) return;

  await db
    .update(rides)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(and(eq(rides.id, rideId), eq(rides.status, ride.status)));
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
  await syncRideStatusOnTripComplete(db, trip.booking.ride.id);

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

// --- Live tracking (docs/domain/live-tracking.md) -------------------------

/** Driver taps "Démarrer le trajet" — the one action that starts tracking.
 *  Only valid from `scheduled`; notifies the rider using the pre-modeled
 *  `trip_driver_approaching` event type (Phase 7 added it to the schema but
 *  nothing ever dispatched it until now). */
export async function startTrip(db: Database, tripId: string, requestingUserId: string) {
  const trip = await getTripWithPartiesOrThrow(db, tripId);
  assertIsDriver(trip, requestingUserId);

  if (!canTransitionTripStatus(trip.status, 'driver_approaching')) {
    throw new ConflictError(`Cannot start a trip in status "${trip.status}"`);
  }

  const now = new Date();
  const [updated] = await db
    .update(trips)
    .set({ status: 'driver_approaching', startedAt: now, updatedAt: now })
    .where(eq(trips.id, tripId))
    .returning();
  if (!updated) throw new Error('Failed to start trip');

  await notifyBestEffort(db, trip.booking.riderId, 'trip_driver_approaching', {
    tripId,
    bookingId: trip.bookingId,
  });
  await publishTripUpdate(tripId, { type: 'status', tripStatus: updated.status });
  await syncRideStatusOnTripStart(db, trip.booking.ride.id);

  return updated;
}

/** Driver taps "Passager à bord" — the one journey-progress step GPS can't
 *  infer on its own (proximity alone can't tell a parked-nearby driver from
 *  a driver who genuinely has the rider in the car). Accepts either
 *  `driver_approaching` (the proximity auto-transition to `pickup` hasn't
 *  fired yet — GPS accuracy, a rider who walked to the driver, etc.) or
 *  `pickup`, always landing on `active` via a `pickup` pass-through so the
 *  domain state machine's `driver_approaching -> active` non-edge is never
 *  violated. */
export async function confirmPassengerAboard(db: Database, tripId: string, requestingUserId: string) {
  const trip = await getTripWithPartiesOrThrow(db, tripId);
  assertIsDriver(trip, requestingUserId);

  if (trip.status !== 'driver_approaching' && trip.status !== 'pickup') {
    throw new ConflictError(`Cannot confirm boarding for a trip in status "${trip.status}"`);
  }

  const now = new Date();
  if (trip.status === 'driver_approaching') {
    await db
      .update(trips)
      .set({ status: 'pickup', pickupConfirmedAt: now, updatedAt: now })
      .where(eq(trips.id, tripId));
  }

  const [updated] = await db
    .update(trips)
    .set({ status: 'active', pickupConfirmedAt: trip.pickupConfirmedAt ?? now, updatedAt: now })
    .where(eq(trips.id, tripId))
    .returning();
  if (!updated) throw new Error('Failed to confirm boarding');

  await publishTripUpdate(tripId, { type: 'status', tripStatus: updated.status });
  return updated;
}

export interface LocationUpdateInput {
  lat: number;
  lng: number;
  headingDeg?: number | null;
  speedMps?: number | null;
  accuracyM?: number | null;
}

const TRACKABLE_STATUSES: readonly TripStatus[] = [
  'driver_approaching',
  'pickup',
  'active',
  'arriving',
];

// Throttles the (paid, external) ETA recompute — a driver location ping
// arrives every ~6-10s (mobile throttling policy, docs/domain/
// live-tracking.md) but a fresh route/ETA doesn't need recomputing nearly
// that often. In-process only: at most a handful of duplicate calls across
// a multi-instance deployment within one throttle window, an acceptable
// trade for not adding a shared-state dependency to this hot path.
const ETA_RECOMPUTE_INTERVAL_MS = 20_000;
const lastEtaComputedAt = new Map<string, number>();

/** Driver's location ping. Persists only the latest fix (no history table —
 *  CLAUDE.md's live-tracking brief: minimize retention), evaluates the
 *  pure proximity auto-transition, best-effort recomputes a real
 *  road-routed ETA, and broadcasts everything over the trip's WebSocket
 *  room. */
export async function updateTripLocation(
  db: Database,
  tripId: string,
  requestingUserId: string,
  input: LocationUpdateInput,
) {
  const trip = await getTripWithPartiesOrThrow(db, tripId);
  assertIsDriver(trip, requestingUserId);

  if (!TRACKABLE_STATUSES.includes(trip.status)) {
    throw new ConflictError(`Cannot update location for a trip in status "${trip.status}"`);
  }

  const now = new Date();
  const currentPos = { lat: input.lat, lng: input.lng };
  const pickup = pickupPoint(trip);
  const destination = destinationPoint(trip);

  const autoNextStatus = computeAutoTripStatusTransition(
    trip.status,
    currentPos,
    pickup,
    destination,
  );

  const [updated] = await db
    .update(trips)
    .set({
      currentLat: input.lat,
      currentLng: input.lng,
      currentHeadingDeg: input.headingDeg ?? null,
      currentSpeedMps: input.speedMps ?? null,
      currentAccuracyM: input.accuracyM ?? null,
      locationUpdatedAt: now,
      updatedAt: now,
      ...(autoNextStatus ? { status: autoNextStatus } : {}),
      ...(autoNextStatus === 'pickup' ? { pickupConfirmedAt: now } : {}),
    })
    .where(eq(trips.id, tripId))
    .returning();
  if (!updated) throw new Error('Failed to update trip location');

  if (autoNextStatus === 'pickup') {
    await notifyBestEffort(db, trip.booking.riderId, 'trip_pickup_arrived', { tripId, bookingId: trip.bookingId });
  }
  if (autoNextStatus === 'arriving') {
    await notifyBestEffort(db, trip.booking.riderId, 'trip_arriving', { tripId, bookingId: trip.bookingId });
  }

  let etaSec: number | null = null;
  let distanceRemainingM: number | null = null;
  const lastComputed = lastEtaComputedAt.get(tripId) ?? 0;
  if (now.getTime() - lastComputed >= ETA_RECOMPUTE_INTERVAL_MS) {
    lastEtaComputedAt.set(tripId, now.getTime());
    try {
      const route = await getRoute(currentPos, destination);
      etaSec = route.durationSec;
      distanceRemainingM = route.distanceM;
    } catch (err) {
      getLogger().warn({ err, tripId }, 'Live ETA recompute failed — continuing without it');
    }
  }

  const trackingStatus = deriveTrackingStatus({
    tripStatus: updated.status,
    locationUpdatedAt: updated.locationUpdatedAt,
    now,
  });

  const payload = {
    type: 'location' as const,
    tripStatus: updated.status,
    trackingStatus,
    currentLat: updated.currentLat,
    currentLng: updated.currentLng,
    currentHeadingDeg: updated.currentHeadingDeg,
    currentSpeedMps: updated.currentSpeedMps,
    locationUpdatedAt: updated.locationUpdatedAt,
    ...(etaSec !== null ? { etaSec, distanceRemainingM } : {}),
  };
  await publishTripUpdate(tripId, payload);

  return { trip: updated, trackingStatus, etaSec, distanceRemainingM };
}

/** Driver's app explicitly signals a real tracking problem (GPS permission
 *  revoked, location services disabled) — client-detected, not server-
 *  inferred from silence, since silence alone is just as often a normal
 *  network hiccup the next ping will resolve. Sent at most once per real
 *  episode (the client is responsible for not spamming this on every
 *  failed attempt). */
export async function reportTrackingIssue(
  db: Database,
  tripId: string,
  requestingUserId: string,
): Promise<void> {
  const trip = await getTripWithPartiesOrThrow(db, tripId);
  assertIsDriver(trip, requestingUserId);

  await notifyBestEffort(db, trip.booking.riderId, 'trip_tracking_unavailable', {
    tripId,
    bookingId: trip.bookingId,
  });
  await publishTripUpdate(tripId, { type: 'tracking_issue' });
}

export interface TrackingState {
  tripStatus: TripStatus;
  trackingStatus: ReturnType<typeof deriveTrackingStatus>;
  currentLat: number | null;
  currentLng: number | null;
  currentHeadingDeg: number | null;
  currentSpeedMps: number | null;
  locationUpdatedAt: Date | null;
  routePolyline: string | null;
  pickup: { lat: number; lng: number; label: string };
  destination: { lat: number; lng: number; label: string };
}

/** Read model for the passenger/driver tracking screen's initial fetch and
 *  polling fallback (the same shape the WebSocket pushes incrementally) —
 *  RTK Query can poll this exactly like every other list in this app when a
 *  socket connection isn't available. */
export async function getTrackingState(
  db: Database,
  tripId: string,
  requestingUserId: string,
): Promise<TrackingState> {
  const trip = await getTripWithPartiesOrThrow(db, tripId);
  assertIsParty(trip, requestingUserId);

  const destination = destinationPoint(trip);
  return {
    tripStatus: trip.status,
    trackingStatus: deriveTrackingStatus({
      tripStatus: trip.status,
      locationUpdatedAt: trip.locationUpdatedAt,
      now: new Date(),
    }),
    currentLat: trip.currentLat,
    currentLng: trip.currentLng,
    currentHeadingDeg: trip.currentHeadingDeg,
    currentSpeedMps: trip.currentSpeedMps,
    locationUpdatedAt: trip.locationUpdatedAt,
    routePolyline: trip.booking.ride.routePolyline,
    pickup: {
      lat: trip.booking.pickupLat,
      lng: trip.booking.pickupLng,
      label: trip.booking.pickupLabel,
    },
    destination: {
      lat: destination.lat,
      lng: destination.lng,
      label: trip.booking.dropoffLabel ?? trip.booking.ride.destinationLabel,
    },
  };
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
