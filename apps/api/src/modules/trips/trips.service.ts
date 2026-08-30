import { and, eq, inArray } from 'drizzle-orm';
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
  classifyEtaConfidence,
  classifyRouteDeviation,
  computeAutoTripStatusTransition,
  computeStaleTripAction,
  deriveTrackingStatus,
  evaluateAutoNoShowClassification,
  evaluateAutoStart,
  evaluateBoarding,
  isWithinRatingWindow,
  updateLiveCorridor,
  PICKUP_ARRIVAL_RADIUS_M,
  type TripStatus,
} from '@vaya/domain';
import { notifyBestEffort } from '../notifications/notifications.service.js';
import { applyAutoNoShowClassification } from '../bookings/bookings.service.js';
import { publishTripUpdate } from '../../lib/realtime.js';
import { getRoute } from '../../lib/routing.js';
import { decodePolyline, projectPointOntoRoute } from '../../lib/polyline.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
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
/** Everything that must happen once a trip's row is *already* written as
 *  `completed` — shared between the driver/rider's manual "Terminer le
 *  trajet" (completeTrip below) and live tracking's own GPS-confirmed
 *  auto-completion (updateTripLocation), so the two paths can never drift:
 *  a trip closed automatically gets exactly the same booking-sync/trip-
 *  count/rating-prompt treatment as one closed by a tap. */
async function applyTripCompletionSideEffects(
  db: Database,
  trip: Awaited<ReturnType<typeof getTripWithPartiesOrThrow>>,
  completedAt: Date,
): Promise<void> {
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
  await notifyBestEffort(db, driverUserId, 'trip_completed', { tripId: trip.id, bookingId: trip.bookingId });
  await notifyBestEffort(db, riderId, 'trip_completed', { tripId: trip.id, bookingId: trip.bookingId });
}

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

  await applyTripCompletionSideEffects(db, trip, completedAt);

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

  // M-094/INV-06: same notification the auto-detected boarding path below
  // (updateTripLocation) sends — the moment passenger-facing live tracking
  // becomes available is worth a real notification regardless of which
  // path (manual tap or GPS-inferred) reached it.
  await notifyBestEffort(db, trip.booking.riderId, 'trip_passenger_onboard', { tripId, bookingId: trip.bookingId });
  // M-113 (spec §39, "live journey started") — the driver-facing
  // counterpart of the same pickup -> active transition: distinct from
  // trip_passenger_onboard (rider-facing, "you can now track this trip")
  // rather than reusing it for both parties.
  await notifyBestEffort(db, trip.booking.ride.driverProfile.userId, 'trip_active', {
    tripId,
    bookingId: trip.bookingId,
  });
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

// M-099/M-100 (docs/unified_driver_and_passenger_journey.md §35, journey-
// contract second pass): a `scheduled` trip is now also trackable — GPS
// pings before the driver taps "Start trip" are exactly the evidence
// `evaluateAutoStart` needs (origin proximity, movement) to auto-advance
// without one. apps/mobile's driver location broadcast (see
// useDriverLocationBroadcast.ts) opts a scheduled trip in only once its
// ride's departure is imminent — this server-side allowance doesn't by
// itself change when GPS pings actually start arriving.
const TRACKABLE_STATUSES: readonly TripStatus[] = [
  'scheduled',
  'driver_approaching',
  'pickup',
  'active',
  'arriving',
];

// M-096/M-097 (spec §33): sustained, not momentary — a driver must have
// been genuinely near the pickup point for at least this long (not just
// one lucky-timed ping) before proximity counts as "sustained" evidence
// toward auto-boarding. Two-ish real GPS pings at the ~6-10s mobile
// broadcast cadence (docs/domain/live-tracking.md).
const BOARDING_SUSTAINED_PROXIMITY_MIN_MS = 15_000;
// A real position shift between two consecutive real pings, beyond
// ordinary GPS jitter, treated as "the vehicle moved" for boarding's
// `movement` signal.
const BOARDING_MOVEMENT_MIN_METERS = 15;

// Throttles the (paid, external) ETA recompute — a driver location ping
// arrives every ~6-10s (mobile throttling policy, docs/domain/
// live-tracking.md) but a fresh route/ETA doesn't need recomputing nearly
// that often. In-process only: at most a handful of duplicate calls across
// a multi-instance deployment within one throttle window, an acceptable
// trade for not adding a shared-state dependency to this hot path.
const ETA_RECOMPUTE_INTERVAL_MS = 20_000;
const lastEtaComputedAt = new Map<string, number>();

// M-113 (spec §39, "route/ETA changed" — the ETA-only half): how much a
// fresh live ETA recompute must drift from the last one a rider was
// actually notified about before it's worth a real notification, not just
// the WebSocket-only update every recompute already gets. Deliberately
// much coarser than the 20s recompute interval above — this is the
// difference between "the number on screen ticked down normally" and "your
// arrival time genuinely moved," per M-114's "no notification spam from
// routine pings" invariant.
const ETA_CHANGE_NOTIFY_THRESHOLD_SEC = 5 * 60;

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
  const previousPos =
    trip.currentLat != null && trip.currentLng != null ? { lat: trip.currentLat, lng: trip.currentLng } : null;

  let autoNextStatus = computeAutoTripStatusTransition(trip.status, currentPos, pickup, destination);
  let autoStartedAt: Date | null = null;
  // M-104 (spec §37): the one bit of pre-start location "history" this
  // schema keeps (trips.driverEverNearOriginAt's own doc comment) — set the
  // first time the driver's real, live-broadcast position genuinely comes
  // within pickup-arrival radius of the ride's origin while still
  // `scheduled`, independent of whether that alone was enough to also
  // auto-start the trip below. Never cleared once true.
  let driverNearOriginThisPing = false;

  // M-099/M-100 (spec §35): "scheduled -> started" without a button tap.
  // `computeAutoTripStatusTransition` (packages/domain) has no case for
  // `scheduled` at all — this is the real caller `evaluateAutoStart` never
  // had before this pass.
  if (!autoNextStatus && trip.status === 'scheduled') {
    const origin = { lat: trip.booking.ride.originLat, lng: trip.booking.ride.originLng };
    const timeReached = now.getTime() >= trip.booking.ride.departureAt.getTime();
    const originProximity = haversineDistanceMeters(currentPos, origin) <= PICKUP_ARRIVAL_RADIUS_M;
    driverNearOriginThisPing = originProximity;
    const sustainedMovement = previousPos
      ? haversineDistanceMeters(previousPos, currentPos) >= BOARDING_MOVEMENT_MIN_METERS
      : false;
    const routeProgress = previousPos
      ? haversineDistanceMeters(currentPos, pickup) < haversineDistanceMeters(previousPos, pickup)
      : false;

    const autoStart = evaluateAutoStart({ timeReached, originProximity, sustainedMovement, routeProgress });
    if (autoStart.shouldStart && canTransitionTripStatus(trip.status, 'driver_approaching')) {
      autoNextStatus = 'driver_approaching';
      autoStartedAt = now;
    }
  }

  // M-096/M-097 (spec §33): "pickup -> active" (boarding) without a button
  // tap — `confirmPassengerAboard` (the manual driver-tap path) remains the
  // independently-sufficient `driverConfirmed`/`passengerConfirmed` branch
  // of the exact same `evaluateBoarding` contract; this is the automatic
  // branch that previously had no caller at all.
  if (!autoNextStatus && trip.status === 'pickup' && trip.pickupConfirmedAt) {
    const sustainedProximityMet =
      now.getTime() - trip.pickupConfirmedAt.getTime() >= BOARDING_SUSTAINED_PROXIMITY_MIN_MS &&
      haversineDistanceMeters(currentPos, pickup) <= PICKUP_ARRIVAL_RADIUS_M;
    const movement = previousPos
      ? haversineDistanceMeters(previousPos, currentPos) >= BOARDING_MOVEMENT_MIN_METERS
      : false;
    const routeContext = previousPos
      ? haversineDistanceMeters(currentPos, destination) < haversineDistanceMeters(previousPos, destination)
      : false;

    const boarding = evaluateBoarding({
      sustainedProximityMet,
      movement,
      routeContext,
      pickupTimingPlausible: true, // already at `pickup` status — timing is inherently plausible
      driverConfirmed: false,
      passengerConfirmed: false,
    });
    if (boarding.shouldBoard && canTransitionTripStatus(trip.status, 'active')) {
      autoNextStatus = 'active';
    }
  }

  // M-090/EDGE-051/INV-08 (spec §29/§51): planned route vs. live feasible
  // corridor. Only meaningful against a real (non-haversine-fallback)
  // route — `lib/routing.ts`'s fallback always yields an empty polyline,
  // which can't be projected against.
  let routeDeviationStatus: ReturnType<typeof classifyRouteDeviation> | null = null;
  let liveCorridorWaypoints: unknown = trip.liveCorridorWaypoints;
  let deviationJustDetected = false;
  const plannedPolyline = trip.booking.ride.routePolyline;
  if (plannedPolyline) {
    const plannedRoute = { waypoints: decodePolyline(plannedPolyline) };
    const projection = projectPointOntoRoute(currentPos, plannedRoute.waypoints);
    routeDeviationStatus = classifyRouteDeviation(projection.distanceM);
    const priorLiveCorridor = trip.liveCorridorWaypoints
      ? { waypoints: trip.liveCorridorWaypoints as { lat: number; lng: number }[] }
      : plannedRoute;
    const nextState = updateLiveCorridor(
      { plannedRoute, liveCorridor: priorLiveCorridor },
      routeDeviationStatus,
      // A simplified live corridor — the driver's current position through
      // to their unchanged planned destination, not a freshly re-routed
      // polyline (that needs a real routing-engine call per update, a
      // heavier SCALE-phase concern per CLAUDE.md's NOW/NEXT/SCALE
      // horizons — this is the honest v1: real classification, real
      // invariant enforcement, a simplified corridor shape).
      [currentPos, destination],
    );
    liveCorridorWaypoints = nextState.liveCorridor.waypoints;
    deviationJustDetected =
      routeDeviationStatus === 'real_deviation' && trip.routeDeviationStatus !== 'real_deviation';
  }

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
      ...(routeDeviationStatus ? { routeDeviationStatus, liveCorridorWaypoints } : {}),
      ...(autoNextStatus ? { status: autoNextStatus } : {}),
      ...(autoStartedAt ? { startedAt: autoStartedAt } : {}),
      ...(autoNextStatus === 'pickup' ? { pickupConfirmedAt: now } : {}),
      // completeTrip's manual path sets this too — the 24h rating-submission
      // window (packages/domain's isWithinRatingWindow) anchors on it, so a
      // GPS-auto-completed trip needs the same real timestamp, not null.
      ...(autoNextStatus === 'completed' ? { completedAt: now } : {}),
      ...(driverNearOriginThisPing && !trip.driverEverNearOriginAt ? { driverEverNearOriginAt: now } : {}),
    })
    .where(eq(trips.id, tripId))
    .returning();
  if (!updated) throw new Error('Failed to update trip location');

  if (autoNextStatus === 'driver_approaching') {
    await notifyBestEffort(db, trip.booking.riderId, 'trip_driver_approaching', { tripId, bookingId: trip.bookingId });
    await syncRideStatusOnTripStart(db, trip.booking.ride.id);
  }
  if (autoNextStatus === 'pickup') {
    await notifyBestEffort(db, trip.booking.riderId, 'trip_pickup_arrived', { tripId, bookingId: trip.bookingId });
  }
  if (autoNextStatus === 'active' && trip.status === 'pickup') {
    // M-094/INV-06: the exact moment passenger-facing live tracking
    // becomes available — worth a real notification, not just a silent
    // status flip the rider would only notice by happening to poll.
    await notifyBestEffort(db, trip.booking.riderId, 'trip_passenger_onboard', { tripId, bookingId: trip.bookingId });
    // M-113 (spec §39, "live journey started") — same driver-facing
    // counterpart confirmPassengerAboard's manual path sends, for the
    // GPS-inferred boarding path.
    await notifyBestEffort(db, trip.booking.ride.driverProfile.userId, 'trip_active', {
      tripId,
      bookingId: trip.bookingId,
    });
  }
  if (autoNextStatus === 'arriving') {
    await notifyBestEffort(db, trip.booking.riderId, 'trip_arriving', { tripId, bookingId: trip.bookingId });
  }
  if (deviationJustDetected) {
    await notifyBestEffort(db, trip.booking.riderId, 'trip_route_deviation', { tripId, bookingId: trip.bookingId });
  }
  if (autoNextStatus === 'completed') {
    // GPS confirmed real arrival at the destination (computeAutoTripStatusTransition's
    // tight DESTINATION_ARRIVED_RADIUS_M check) — the trip row above is
    // already written as `completed`; this is the same booking-sync/trip-
    // count/rating-prompt path the manual "Terminer le trajet" tap uses
    // (completeTrip), so a trip that closes itself is indistinguishable
    // downstream from one a party closed by hand. Never left "in progress"
    // forever just because nobody tapped the button.
    await applyTripCompletionSideEffects(db, trip, now);
  }

  let etaSec: number | null = null;
  let distanceRemainingM: number | null = null;
  let meaningfulEtaChangeSec: number | null = null;
  const lastComputed = lastEtaComputedAt.get(tripId) ?? 0;
  if (now.getTime() - lastComputed >= ETA_RECOMPUTE_INTERVAL_MS) {
    lastEtaComputedAt.set(tripId, now.getTime());
    try {
      const route = await getRoute(currentPos, destination);
      etaSec = route.durationSec;
      distanceRemainingM = route.distanceM;

      // M-113: the first-ever computation just establishes a baseline (no
      // "changed" to report yet, nothing to compare against); a later one
      // only counts as notify-worthy once it drifts past the threshold —
      // and only THEN does the stored baseline move, so a slow drift across
      // many small recomputes still eventually crosses it exactly once,
      // rather than resetting the comparison point on every tick.
      const previousNotifiedEtaSec = trip.lastNotifiedEtaSec;
      if (previousNotifiedEtaSec === null) {
        await db.update(trips).set({ lastNotifiedEtaSec: etaSec }).where(eq(trips.id, tripId));
      } else if (Math.abs(etaSec - previousNotifiedEtaSec) >= ETA_CHANGE_NOTIFY_THRESHOLD_SEC) {
        await db.update(trips).set({ lastNotifiedEtaSec: etaSec }).where(eq(trips.id, tripId));
        meaningfulEtaChangeSec = etaSec;
      }
    } catch (err) {
      getLogger().warn({ err, tripId }, 'Live ETA recompute failed — continuing without it');
    }
  }

  if (meaningfulEtaChangeSec !== null) {
    await notifyBestEffort(db, trip.booking.riderId, 'trip_eta_changed', {
      tripId,
      bookingId: trip.bookingId,
      etaMinutes: Math.round(meaningfulEtaChangeSec / 60),
    });
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
  // M-007 (docs/unified_driver_and_passenger_journey.md P7, spec §29):
  // "ETAs are estimates. VAYA should distinguish: estimated, confirmed,
  // inferred, unavailable." Confirmed live (this pass, before the fix)
  // that `classifyEtaConfidence` (packages/domain) existed with no real
  // caller anywhere — every tracking read implicitly claimed the same
  // certainty regardless of feed health or route-data quality.
  etaConfidence: ReturnType<typeof classifyEtaConfidence>;
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
// M-094/INV-06 (docs/unified_driver_and_passenger_journey.md §32, §62,
// hard invariant): "Pre-boarding: passenger sees ETA/pickup/route info,
// NEVER raw driver GPS." Confirmed live (this pass) that `getTrackingState`
// previously returned raw `currentLat`/`currentLng`/heading/speed to a
// passenger regardless of trip status — a passenger polling this endpoint
// the moment a request was accepted could see the driver's exact live
// position hours before pickup. Boarding is `pickup -> active` (matches
// `evaluateBoarding`'s own transition, trip/boarding-inference.ts) — every
// status before that is pre-boarding for privacy purposes. The driver
// always sees their own raw position (no privacy concern viewing your own
// GPS); operational tracking itself (M-093, `updateTripLocation`) is
// unaffected — only this passenger-facing READ is scoped.
const PRE_BOARDING_TRIP_STATUSES: readonly TripStatus[] = ['scheduled', 'driver_approaching', 'pickup'];

/** Whether `userId` is this trip's driver (vs. its rider) — used by the WS
 *  tracking route (trips.routes.ts) to tag a connecting socket with its
 *  role, so lib/realtime.ts's broadcast fan-out can apply the same
 *  pre-boarding GPS redaction `getTrackingState` applies below. Callers
 *  that already resolved a `getTrackingState` result don't need this; it's
 *  for connection setup, where only the role (not the full state) is
 *  needed yet. */
export async function isTripDriver(db: Database, tripId: string, userId: string): Promise<boolean> {
  const trip = await getTripWithPartiesOrThrow(db, tripId);
  assertIsParty(trip, userId);
  return trip.booking.ride.driverProfile.userId === userId;
}

export async function getTrackingState(
  db: Database,
  tripId: string,
  requestingUserId: string,
): Promise<TrackingState> {
  const trip = await getTripWithPartiesOrThrow(db, tripId);
  assertIsParty(trip, requestingUserId);

  const isDriver = trip.booking.ride.driverProfile.userId === requestingUserId;
  const isPreBoarding = PRE_BOARDING_TRIP_STATUSES.includes(trip.status);
  const withholdRawGps = !isDriver && isPreBoarding;

  const destination = destinationPoint(trip);
  const liveTrackingStatus = deriveTrackingStatus({
    tripStatus: trip.status,
    locationUpdatedAt: trip.locationUpdatedAt,
    now: new Date(),
  });
  return {
    tripStatus: trip.status,
    trackingStatus: liveTrackingStatus,
    // A non-empty routePolyline means the ride's route came from a real
    // routing engine at publish time (lib/routing.ts's haversine fallback
    // always sets it to '') — the same real/estimate distinction pricing
    // and matching already use, reused here rather than a second concept.
    etaConfidence: classifyEtaConfidence({
      trackingStatus: liveTrackingStatus,
      hasRealRouteData: Boolean(trip.booking.ride.routePolyline),
    }),
    currentLat: withholdRawGps ? null : trip.currentLat,
    currentLng: withholdRawGps ? null : trip.currentLng,
    currentHeadingDeg: withholdRawGps ? null : trip.currentHeadingDeg,
    currentSpeedMps: withholdRawGps ? null : trip.currentSpeedMps,
    locationUpdatedAt: withholdRawGps ? null : trip.locationUpdatedAt,
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

// --- Trip-staleness sweep ---------------------------------------------
// packages/domain/src/trip/trip-staleness.ts's own doc comment explains the
// "why": GPS-confirmed tight-radius auto-completion (computeAutoTripStatusTransition)
// handles the common case where the driver's phone is still broadcasting;
// this periodic sweep is the safety net for when it isn't — the driver
// forgot, backgrounded the app, or the trip is simply abandoned. Run as a
// BullMQ repeatable job (lib/queue.ts, worker.ts), same "one queue, routed
// by job.name" pattern Phase 11's recurring-pattern scan established.

export interface TripStalenessSweepResult {
  scanned: number;
  reminded: number;
  autoCompleted: number;
  autoNoShowClassified: number;
}

/**
 * One pass over every trip still in a trackable (non-terminal, already-
 * started) status: for each, asks the pure computeStaleTripAction whether
 * it's overdue enough to nudge or to close outright, and applies whichever
 * it says. Never throws on a single trip's failure — one bad row must not
 * abort the sweep for every other trip in the batch (mirrors
 * notification-dispatch.worker.ts's per-job isolation).
 *
 * M-104 (spec §37) is evaluated first, per trip, ahead of the `!startedAt`
 * skip below — a `scheduled` trip (the driver-no-show candidate) never has
 * `startedAt` set at all, so it would otherwise never reach this sweep's
 * logic a single time.
 */
export async function runTripStalenessSweep(db: Database): Promise<TripStalenessSweepResult> {
  const staleCandidates = await db.query.trips.findMany({
    where: inArray(trips.status, [...TRACKABLE_STATUSES]),
    with: { booking: { with: { ride: { with: { driverProfile: true } } } } },
  });

  const now = new Date();
  const result: TripStalenessSweepResult = {
    scanned: staleCandidates.length,
    reminded: 0,
    autoCompleted: 0,
    autoNoShowClassified: 0,
  };

  for (const trip of staleCandidates) {
    if (trip.status === 'scheduled' || trip.status === 'pickup') {
      try {
        const departureAt = trip.booking.ride.departureAt;
        const classification = evaluateAutoNoShowClassification({
          tripStatus: trip.status,
          msSincePickupConfirmed: trip.pickupConfirmedAt ? now.getTime() - trip.pickupConfirmedAt.getTime() : null,
          msSinceDeparture: now.getTime() - departureAt.getTime(),
          driverLocationActiveSinceDeparture:
            trip.locationUpdatedAt != null && trip.locationUpdatedAt.getTime() >= departureAt.getTime(),
          driverEverNearOrigin: trip.driverEverNearOriginAt != null,
        });
        if (classification.shouldClassify && classification.reportedParty) {
          await applyAutoNoShowClassification(db, trip.bookingId, classification.reportedParty);
          result.autoNoShowClassified += 1;
          continue; // Now terminal (no_show) — nothing else in this loop applies to it.
        }
      } catch (err) {
        getLogger().error({ err, tripId: trip.id }, 'Auto no-show classification failed for one trip — continuing with the rest');
      }
    }

    // Always set once startTrip runs (the only way a trip reaches a
    // TRACKABLE_STATUSES status) — defensive null-check only, not an
    // expected real case.
    if (!trip.startedAt) continue;

    const action = computeStaleTripAction({
      startedAt: trip.startedAt,
      locationUpdatedAt: trip.locationUpdatedAt,
      estimatedDurationSec: trip.booking.ride.estimatedDurationSec,
      reminderAlreadySent: trip.completionReminderSentAt != null,
      now,
    });

    try {
      if (action === 'remind') {
        await db
          .update(trips)
          .set({ completionReminderSentAt: now, updatedAt: now })
          .where(eq(trips.id, trip.id));
        const driverUserId = trip.booking.ride.driverProfile.userId;
        const riderId = trip.booking.riderId;
        await notifyBestEffort(db, driverUserId, 'trip_completion_reminder', {
          tripId: trip.id,
          bookingId: trip.bookingId,
        });
        await notifyBestEffort(db, riderId, 'trip_completion_reminder', {
          tripId: trip.id,
          bookingId: trip.bookingId,
        });
        result.reminded += 1;
      } else if (action === 'auto_complete') {
        const [updated] = await db
          .update(trips)
          .set({ status: 'completed', completedAt: now, updatedAt: now })
          .where(and(eq(trips.id, trip.id), eq(trips.status, trip.status)))
          .returning();
        // A concurrent GPS ping or manual "Terminer" already closed it
        // between the query above and this write — nothing left to do.
        if (updated) {
          await applyTripCompletionSideEffects(db, trip, now);
          result.autoCompleted += 1;
        }
      }
    } catch (err) {
      getLogger().error({ err, tripId: trip.id, action }, 'Trip-staleness sweep failed for one trip — continuing with the rest');
    }
  }

  return result;
}
