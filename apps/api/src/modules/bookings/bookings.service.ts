import { and, eq, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { bookings, rides, routeStops, riderProfiles, trips, users } from '../../db/schema/index.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import {
  canCancelTrip,
  canTransitionBookingStatus,
  canTransitionRideStatus,
  canTransitionTripStatus,
  classifyTripProfile,
  computeBookingExpiresAt,
  computeCancellationPolicy,
  computeMaxConcurrentSeats,
  computeSuggestedPrice,
  detourAllowanceSec,
  evaluateExistingPassengerImpact,
  evaluateNoShowReport,
  findSameJourneySiblings,
  getMatchingThresholds,
  wouldExceedCapacity,
  CANCELLATION_REASONS,
  NO_SHOW_PENALTY_POINTS,
  type BookingSegment,
  type CancellationPolicyResult,
  type CancellationReason,
  type ExistingPassengerImpactInput,
  type RatingRole,
} from '@vaya/domain';
import type { CreateBookingInput } from '@vaya/validation';
import { decodePolyline, polylineLengthMeters, projectPointOntoRoute } from '../../lib/polyline.js';
// Phase 7 (docs/roadmap/phase-07-notifications.md): notification-row
// creation hooked in around the existing accept/decline/request flows
// below — Phase 1's atomic seat-accounting logic in acceptBooking/
// cancelBooking is untouched, this only adds a best-effort side effect
// after each transition already succeeded.
import { notifyBestEffort } from '../notifications/notifications.service.js';
// Phase 8 (docs/roadmap/phase-08-messaging.md): a conversation is
// auto-created the moment a booking reaches `accepted`, and closed the
// moment its trip is cancelled — both hooked in the same best-effort style
// as notifyBestEffort above, right after the acceptBooking/cancelBooking
// logic they piggyback on has already fully succeeded.
import {
  createConversationBestEffort,
  closeConversationBestEffort,
} from '../conversations/conversations.service.js';
// Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md): the reputation
// consequence (weighted penalty points, and — for a reported no-show — an
// automatic low rating) is applied via Phase 9's rating/reliability
// mechanism, not a second, parallel one.
import {
  applyCancellationPenalty,
  recordAutomaticNoShowRating,
} from '../ratings/ratings.service.js';
import { getRoute } from '../../lib/routing.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
import { getActivePricingConfig } from '../pricing/pricing.service.js';
import { getActiveOperationalConfig } from '../operational-config/operational-config.service.js';

type Database = ReturnType<typeof getDatabase>;
/** The transaction-callback handle drizzle's node-postgres driver passes
 *  in — derived via `Parameters<>` rather than importing `NodePgTransaction`
 *  directly and re-declaring its generic schema/relations parameters by
 *  hand, so this stays correct if the schema shape changes. */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Segment-aware multi-passenger capacity (matching-engine architecture plan
 * §K — un-deferred, implemented here rather than left as documented-but-not-
 * built). `rides.seatsAvailable` used to be a single scalar, decremented on
 * accept and restored on cancel — correct for "how many total seats are
 * free right now", wrong for "is this specific segment of the route free":
 * a driver with 4 seats and an already-accepted Tunis→Hammamet passenger
 * genuinely has 4 free seats for a later Hammamet→Sousse request, which a
 * ride-global counter can't express. The pure interval-overlap math lives
 * in packages/domain's segment-capacity.ts; everything below is the
 * database-facing half — resolving a booking's pickup/dropoff stop ids to
 * their real route_stop `sequence`, and running the whole
 * check-then-persist cycle inside one transaction that locks the ride row
 * first (`SELECT ... FOR UPDATE`), the generalization of Phase 1/10's
 * atomic `UPDATE ... WHERE seatsAvailable >= N` guard to a check that can't
 * be expressed as a single UPDATE's WHERE clause.
 *
 * **Scope boundary, stated plainly**: this makes booking *creation* and
 * *acceptance* genuinely segment-aware — a fitting non-overlapping-segment
 * request can be created and accepted even when the ride's bottleneck
 * segment (from other bookings) is saturated. It does NOT make
 * matching.service.ts's search-time candidate filtering segment-aware —
 * `scoreCandidates`/`scorePassThroughCandidates`/`scoreDetourCandidates`
 * still gate on the ride-global `seatsAvailable` (now the *bottleneck*
 * segment's remaining capacity), so a ride saturated on one segment may not
 * surface in search for a rider whose specific requested segment is
 * actually free, until search itself is made segment-aware — a distinct,
 * larger change to the matching pipeline, not bundled into this pass.
 */
function bookingToSegment(
  booking: { seatsRequested: number; pickupStopId: string | null; dropoffStopId: string | null },
  sequenceByStopId: Map<string, number>,
): BookingSegment {
  return {
    seatsRequested: booking.seatsRequested,
    // A stop id that no longer resolves (set null by a stop regeneration,
    // per bookings.pickupStopId/dropoffStopId's ON DELETE SET NULL — see
    // bookings.schema.ts) or was never set at all (a free-form/legacy
    // booking) is treated as spanning the ride's true start/end — the
    // conservative direction: an unresolved reference can only ever make
    // capacity accounting stricter, never looser.
    pickupSequence: booking.pickupStopId
      ? (sequenceByStopId.get(booking.pickupStopId) ?? -Infinity)
      : -Infinity,
    dropoffSequence: booking.dropoffStopId
      ? (sequenceByStopId.get(booking.dropoffStopId) ?? Infinity)
      : Infinity,
  };
}

/** Every currently-`accepted` booking on a ride, as `BookingSegment`s, plus
 *  whether the ride has any route_stops at all (needed below to decide
 *  the `published`/`full` transition). Two call shapes: from inside a
 *  transaction that already holds a row lock on the ride (`.for('update')`)
 *  for an atomic accept/cancel/no-show recompute, where the accepted set
 *  this reads can't change underneath the caller — or with a plain
 *  `Database` for createBooking's own non-atomic, advisory pre-check (the
 *  real enforcement point is always acceptBooking, matching this
 *  codebase's existing stale-read-is-fine convention for that check). */
async function loadRideSegmentState(
  tx: Database | Tx,
  rideId: string,
): Promise<{ segments: BookingSegment[]; hasStops: boolean }> {
  const [stops, acceptedBookings] = await Promise.all([
    tx.query.routeStops.findMany({ where: eq(routeStops.rideId, rideId) }),
    tx.query.bookings.findMany({
      where: and(eq(bookings.rideId, rideId), eq(bookings.status, 'accepted')),
    }),
  ]);
  const sequenceByStopId = new Map(stops.map((s) => [s.id, s.sequence]));
  return {
    segments: acceptedBookings.map((b) => bookingToSegment(b, sequenceByStopId)),
    hasStops: stops.length > 0,
  };
}

async function loadAcceptedSegments(tx: Database | Tx, rideId: string): Promise<BookingSegment[]> {
  return (await loadRideSegmentState(tx, rideId)).segments;
}

/**
 * Recomputes `rides.seatsAvailable` (now: seatsTotal minus the ride's
 * current bottleneck-segment occupancy) and, for a legacy/stop-less ride
 * only, `rides.status`'s `published`/`full` transition — from the ride's
 * *current* set of accepted bookings, recomputed from scratch every time
 * rather than incrementally adjusted, the same discipline this codebase's
 * rating aggregate already established (never increment/decrement a
 * derived number when the real source rows are cheap to re-read; see
 * ratings.service.ts). Must be called from inside the same locked
 * transaction that changed the underlying accepted-booking set, after that
 * change has already been written (so `loadRideSegmentState` sees it).
 *
 * **Why `full` is only ever auto-derived for a stop-less ride**: for a
 * legacy ride (zero route_stops) every booking spans the whole ride by
 * construction, so "the bottleneck is saturated" and "no more capacity
 * anywhere" are the same fact — flipping to `full` here is mathematically
 * identical to the pre-segment-aware model's behavior (verified by
 * bookings.service.test.ts's unchanged concurrency suite). For a ride WITH
 * route_stops there is no single global "full" truth anymore: a ride
 * bottlenecked on one segment can still have a different segment wide
 * open. Auto-flipping status the instant any one segment saturates would
 * hide the whole ride from search and block every other request via
 * createBooking's `status !== 'published'` gate — exactly the failure mode
 * this model exists to fix. So a stopped ride's status is left alone here;
 * its capacity is enforced entirely per-request by the segment check
 * itself (createBooking/acceptBooking), with no status flag standing in
 * for it. **Known scope boundary** (stated in this module's top doc
 * comment too): this means a stopped ride whose bottleneck segment is
 * saturated stays `published` and keeps showing up in search even for a
 * request that would fail on that exact segment — matching.service.ts's
 * own `seatsAvailable < 1` filters are a separate, not-yet-segment-aware
 * concern this pass doesn't touch.
 */
async function recomputeAndPersistRideCapacity(
  tx: Tx,
  ride: { id: string; seatsTotal: number; status: (typeof rides.$inferSelect)['status'] },
): Promise<{ seatsAvailable: number; status: (typeof rides.$inferSelect)['status'] }> {
  const { segments, hasStops } = await loadRideSegmentState(tx, ride.id);
  const bottleneckSeatsInUse = computeMaxConcurrentSeats(segments);
  const seatsAvailable = Math.max(0, ride.seatsTotal - bottleneckSeatsInUse);

  let status = ride.status;
  if (!hasStops) {
    const wholeRideCandidate: BookingSegment = { seatsRequested: 1, pickupSequence: -Infinity, dropoffSequence: Infinity };
    const wholeRideWouldFit = !wouldExceedCapacity(segments, wholeRideCandidate, ride.seatsTotal);
    if (!wholeRideWouldFit && canTransitionRideStatus(ride.status, 'full')) {
      status = 'full';
    } else if (wholeRideWouldFit && canTransitionRideStatus(ride.status, 'published')) {
      status = 'published';
    }
  }

  await tx.update(rides).set({ seatsAvailable, status, updatedAt: new Date() }).where(eq(rides.id, ride.id));

  return { seatsAvailable, status };
}

async function getRideOrThrow(db: Database, rideId: string) {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, rideId),
    with: { driverProfile: true },
  });
  if (!ride) throw new NotFoundError('Ride');
  return ride;
}

/**
 * Real, live-validated bound on a free-form pickup or dropoff point on a
 * ride that has driver-selected route_stops — the server-side completion
 * of the matching engine's detour_match tier (matching.service.ts's
 * scoreDetourCandidates), which surfaces exactly this kind of match but
 * historically had no way to actually book it: createBooking used to
 * reject any free-form point outright the moment a ride had any stops at
 * all, regardless of how small a real detour it would cost the driver.
 *
 * Deliberately reuses the exact same real bound the search tier already
 * uses (`detourAllowanceSec`, profile-scaled via `classifyTripProfile`/
 * `getMatchingThresholds`, from `@vaya/domain`) rather than a second,
 * differently-tuned number — a match search surfaced can never then be
 * rejected here by a stricter independent rule, and nothing here ever
 * trusts the client's own claim that a point is a legitimate detour
 * (CLAUDE.md: any endpoint accepting a client-adjustable pickup location
 * must enforce bounds server-side, independent of client-side UI
 * constraints). Throws ValidationError (400) on any failure — an
 * unreachable routing engine is an honest "can't validate this right now"
 * rejection, never a silently-accepted, unverified detour.
 */
/**
 * M-040/EDGE-053 (docs/unified_driver_and_passenger_journey.md §14, edge
 * 53): the one real routing computation both the hard-enforcing
 * `assertRealDetourWithinAllowance` below AND the new, non-throwing
 * `previewPickupOverride` (bookings.routes.ts's pickup-override-preview
 * endpoint) need — extracted so there is exactly one place this detour
 * math lives, never a second parallel implementation for "preview" vs
 * "enforce". `null` return (not a thrown error) is the honest "couldn't
 * compute this" case (no route on the ride, or the routing engine
 * unreachable/estimate-only) — callers decide separately whether that's a
 * hard failure (assertRealDetourWithinAllowance: yes) or a soft "no
 * signal yet" UI state (previewPickupOverride: yes, shown honestly rather
 * than blocking the preview).
 */
export interface DetourImpact {
  extraDurationSeconds: number;
  allowanceSeconds: number;
  withinAllowance: boolean;
}

async function computeDetourImpact(
  db: Database,
  ride: {
    originLat: number;
    originLng: number;
    destinationLat: number;
    destinationLng: number;
    routePolyline: string | null;
  },
  point: { lat: number; lng: number },
): Promise<DetourImpact | null> {
  if (!ride.routePolyline) return null;
  const rideOrigin = { lat: ride.originLat, lng: ride.originLng };
  const rideDestination = { lat: ride.destinationLat, lng: ride.destinationLng };
  const [baseline, withDetour, operationalConfig] = await Promise.all([
    getRoute(rideOrigin, rideDestination),
    getRoute(rideOrigin, rideDestination, [point]),
    // M-085/M-085a (spec §28): the same admin-configurable value
    // matching.service.ts's detour_match tier resolves — one real bound,
    // shared, never a second hardcoded number for the same policy.
    getActiveOperationalConfig(db),
  ]);
  if (baseline.isEstimate || withDetour.isEstimate) {
    // No real routing engine reachable — never fabricate a detour number
    // from a haversine fallback, same discipline as the search tier.
    return null;
  }
  const profile = classifyTripProfile(polylineLengthMeters(decodePolyline(ride.routePolyline)));
  const thresholds = getMatchingThresholds(profile.type);
  const extraDurationSeconds = Math.max(0, withDetour.durationSec - baseline.durationSec);
  const allowanceSeconds = detourAllowanceSec(
    baseline.durationSec,
    thresholds.detourFloorSec,
    thresholds.detourCeilingSec,
    operationalConfig.maxDetourRatio,
  );
  return {
    extraDurationSeconds,
    allowanceSeconds,
    withinAllowance: extraDurationSeconds <= allowanceSeconds,
  };
}

/**
 * Real, live-validated bound on a free-form pickup or dropoff point on a
 * ride that has driver-selected route_stops — the server-side completion
 * of the matching engine's detour_match tier (matching.service.ts's
 * scoreDetourCandidates), which surfaces exactly this kind of match but
 * historically had no way to actually book it: createBooking used to
 * reject any free-form point outright the moment a ride had any stops at
 * all, regardless of how small a real detour it would cost the driver.
 *
 * Deliberately reuses the exact same real bound the search tier already
 * uses (`detourAllowanceSec`, profile-scaled via `classifyTripProfile`/
 * `getMatchingThresholds`, from `@vaya/domain`) rather than a second,
 * differently-tuned number — a match search surfaced can never then be
 * rejected here by a stricter independent rule, and nothing here ever
 * trusts the client's own claim that a point is a legitimate detour
 * (CLAUDE.md: any endpoint accepting a client-adjustable pickup location
 * must enforce bounds server-side, independent of client-side UI
 * constraints). Throws ValidationError (400) on any failure — an
 * unreachable routing engine is an honest "can't validate this right now"
 * rejection, never a silently-accepted, unverified detour.
 *
 * M-040/EDGE-053: this is also, unchanged, the mechanism that already
 * makes "request still allowed... no hidden penalty" true for an override
 * point — it compares only against the ride's own real detour ceiling
 * (never against how much better the driver's own recommended stop would
 * have been), so a technically-feasible-but-driver-unfriendly point was
 * never silently penalized beyond that one real, disclosed bound.
 */
async function assertRealDetourWithinAllowance(
  db: Database,
  ride: {
    originLat: number;
    originLng: number;
    destinationLat: number;
    destinationLng: number;
    routePolyline: string | null;
  },
  point: { lat: number; lng: number },
): Promise<DetourImpact> {
  if (!ride.routePolyline) {
    throw new ValidationError('This ride has no route to validate a detour against');
  }
  const impact = await computeDetourImpact(db, ride, point);
  if (!impact) {
    throw new ValidationError('Unable to validate this pickup or dropoff point right now — please try again');
  }
  if (!impact.withinAllowance) {
    throw new ValidationError("This point is too far from the driver's route for this ride");
  }
  // M-083/084/EDGE-052/INV-09: the real extraDurationSeconds this call
  // already computed — returned so createBooking can feed it into
  // assertExistingPassengerImpactAcceptable without a second routing call.
  return impact;
}

/**
 * M-083/M-084/EDGE-052/INV-09 (docs/unified_driver_and_passenger_journey.md
 * §27, §62 "Existing Passengers Have Soft Protection"): "A new request must
 * be evaluated against all existing confirmed/onboard passengers... their
 * ETA is an estimate, not an immutable contractual timestamp... a small
 * delay is acceptable, a substantial delay is not." Before this function,
 * `evaluateExistingPassengerImpact` (a real, pure, already-tested domain
 * function) had zero real callers anywhere in `apps/api` — confirmed live
 * by grep — so this protection genuinely didn't exist at the booking layer
 * at all, only as an unwired pure function.
 *
 * Only relevant for a genuine free-form detour (`detourExtraDurationSeconds
 * > 0`) — a booking resolved entirely via the driver's own planned
 * route_stops changes nothing about the schedule (the same reasoning
 * `previewBookingDetour`'s own `newEta` doc comment already establishes:
 * "0 when both pickup and dropoff are planned stops — already priced into
 * the published route"), so existing passengers are trivially unaffected
 * and this is skipped entirely for the overwhelming majority of bookings —
 * no wasted computation for the common case.
 *
 * Deliberately reuses only the ride's own ORIGINAL (undetoured) route
 * geometry for every fraction computed here — never a second live routing
 * call per existing passenger, which would turn one new request into N
 * routing-API calls. `detourExtraDurationSeconds` (the one real routing
 * call this booking already made, in `computeDetourImpact`) is applied as
 * the full added delay to every existing passenger whose own dropoff sits
 * at or after the new pickup's insertion point on that route — a
 * documented approximation (no per-leg routing breakdown exists, same
 * category as `previewBookingDetour`'s own stated limitation), not a
 * fabricated number: it's the real total detour cost, conservatively
 * attributed to every passenger who could plausibly experience some share
 * of it, erring toward passenger protection per the spec's own "existing
 * passenger journeys have priority" framing.
 */
async function assertExistingPassengerImpactAcceptable(
  db: Database,
  ride: {
    id: string;
    originLat: number;
    originLng: number;
    destinationLat: number;
    destinationLng: number;
    routePolyline: string | null;
    estimatedDurationSec: number | null;
  },
  /** Whichever of this booking's own points is the FIRST real deviation
   *  from the ride's base route (the earlier of pickup/dropoff, when both
   *  are free-form) — existing passengers alighting before this point are
   *  genuinely unaffected by either deviation. */
  firstDeviationPoint: { lat: number; lng: number },
  /** The combined real extra duration both of this booking's own
   *  deviations cost the driver (pickup's + dropoff's, each already
   *  computed once by assertRealDetourWithinAllowance — never a second
   *  routing call here). */
  totalDetourExtraDurationSeconds: number,
): Promise<void> {
  if (totalDetourExtraDurationSeconds <= 0) return; // Planned-stop booking — no schedule change, nothing to protect against.
  if (!ride.routePolyline || !ride.estimatedDurationSec) return; // No real route/duration to project onto — never fabricate an impact number.

  const existingBookings = await db.query.bookings.findMany({
    where: and(eq(bookings.rideId, ride.id), eq(bookings.status, 'accepted')),
  });
  if (existingBookings.length === 0) return;

  const routePoints = decodePolyline(ride.routePolyline);
  const insertionFraction = clamp01(projectPointOntoRoute(firstDeviationPoint, routePoints).fraction);
  const addedDelayMinutes = totalDetourExtraDurationSeconds / 60;

  const impactInputs: ExistingPassengerImpactInput[] = [];
  for (const existing of existingBookings) {
    const existingDropoffLat = existing.dropoffLat ?? ride.destinationLat;
    const existingDropoffLng = existing.dropoffLng ?? ride.destinationLng;
    const pickupFraction = clamp01(
      projectPointOntoRoute({ lat: existing.pickupLat, lng: existing.pickupLng }, routePoints).fraction,
    );
    const dropoffFraction = clamp01(
      projectPointOntoRoute({ lat: existingDropoffLat, lng: existingDropoffLng }, routePoints).fraction,
    );
    if (dropoffFraction < insertionFraction) continue; // Already alighted before the new detour happens — genuinely unaffected.

    const tripDurationMinutes = Math.max(
      0,
      ((dropoffFraction - pickupFraction) * ride.estimatedDurationSec) / 60,
    );
    impactInputs.push({
      passengerId: existing.riderId,
      tripDurationMinutes,
      addedDelayMinutes,
    });
  }
  if (impactInputs.length === 0) return;

  const opConfig = await getActiveOperationalConfig(db);
  const result = evaluateExistingPassengerImpact(impactInputs, {
    maxDelayRatio: opConfig.existingPassengerMaxDelayRatio,
    maxAbsoluteDelayMinutes: opConfig.existingPassengerMaxAbsoluteDelayMinutes,
  });
  if (!result.acceptable) {
    throw new AppError(
      "This request would delay an already-confirmed passenger's trip by more than acceptable",
      409,
      'EXISTING_PASSENGER_IMPACT_TOO_HIGH',
    );
  }
}

/**
 * M-004/M-020 (docs/unified_driver_and_passenger_journey.md §5/§13): "A
 * selected stop is not a fixed pickup coordinate... VAYA later determines
 * the actual passenger pickup/drop-off location." Before this function,
 * `createBooking` treated a client-supplied `pickupStopId`/`dropoffStopId`
 * as an opaque, fully-trusted id — it only checked ride membership, never
 * whether the stop actually made sense for THIS passenger's real point.
 * When the client also supplies its own `requestedPickup`/`requestedDropoff`
 * (the same point the search that surfaced this stop was run against),
 * this independently re-derives the real walk distance and rejects a
 * selection so far from that point it couldn't be a genuine resolution —
 * "never blindly trust the client's claim", the same discipline
 * `assertRealDetourWithinAllowance` already applies to a free-form point.
 * Returns the real walk distance in meters, to be persisted on the booking
 * (bookings.pickupWalkMeters/dropoffWalkMeters) rather than left as an
 * ephemeral search-time-only value.
 */
function resolveStopWalkMeters(
  ride: { routePolyline: string | null },
  requestedPoint: { lat: number; lng: number },
  stop: { lat: number; lng: number },
  radiusKind: 'pickup' | 'dropoff',
): number {
  const profile = ride.routePolyline
    ? classifyTripProfile(polylineLengthMeters(decodePolyline(ride.routePolyline)))
    : classifyTripProfile(0); // No real route length known — 'commute' is classifyTripProfile's own floor, the most conservative (tightest) radius rather than assuming a generous one.
  const thresholds = getMatchingThresholds(profile.type);
  const radiusM = radiusKind === 'pickup' ? thresholds.widePickupRadiusM : thresholds.wideDropoffRadiusM;
  const walkMeters = haversineDistanceMeters(requestedPoint, stop);
  if (walkMeters > radiusM) {
    throw new ValidationError(
      radiusKind === 'pickup'
        ? 'Selected pickup stop is too far from your requested location'
        : 'Selected dropoff stop is too far from your requested location',
    );
  }
  return walkMeters;
}

/** Live tracking (docs/domain/live-tracking.md): once the driver has
 *  actually started the trip, cancelling stops being the right action for
 *  either party — the ride is genuinely underway (GPS is live, the driver
 *  may already be en route to or with the rider). Reused by both the
 *  cancel mutation and its preview so the rider/driver never sees a
 *  cancellable-looking preview for a trip that's already moving. A booking
 *  with no trip row yet (still `pending`, never accepted) has nothing to
 *  check here — trips are only created at acceptance. */
async function assertTripNotStarted(db: Database, bookingId: string): Promise<void> {
  const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, bookingId) });
  if (!canCancelTrip(trip?.status ?? null)) {
    throw new ForbiddenError('Cannot cancel a booking once the trip has started');
  }
}

async function getBookingOrThrow(db: Database, bookingId: string) {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: { ride: { with: { driverProfile: true } } },
  });
  if (!booking) throw new NotFoundError('Booking');
  return booking;
}

/** Best-effort display name for a notification body — never blocks the
 *  triggering booking action if the lookup itself fails for any reason. */
async function getUserFullNameSafe(db: Database, userId: string): Promise<string | undefined> {
  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    return user?.fullName;
  } catch {
    return undefined;
  }
}

/** Notification-panel redesign (2026-08-23): the driver's booking_requested
 *  card needs a real passenger mini-profile (avatar + rating), not just a
 *  name string — best-effort, same posture as getUserFullNameSafe above.
 *  Rider rating comes from `rider_profiles` (Phase 9), a separate lookup
 *  from `users` since it's a one-to-one optional table, not a column on
 *  `users` itself — a rider with no row yet (never rated) is honestly
 *  `undefined`, not a fabricated 0-that-looks-like-a-real-score. */
async function getRiderNotificationProfileSafe(
  db: Database,
  riderId: string,
): Promise<{ fullName?: string; avatarUrl?: string; ratingAvg?: number }> {
  try {
    const [user, profile] = await Promise.all([
      db.query.users.findFirst({ where: eq(users.id, riderId) }),
      db.query.riderProfiles.findFirst({ where: eq(riderProfiles.userId, riderId) }),
    ]);
    return {
      fullName: user?.fullName,
      avatarUrl: user?.avatarUrl ?? undefined,
      ratingAvg: profile?.ratingAvg,
    };
  } catch {
    return {};
  }
}

/** Driver-side mirror for the rider's booking_accepted/booking_declined
 *  cards — the driver's rating is already loaded on `booking.ride.
 *  driverProfile` at every call site below, so this only needs the
 *  avatar (not on driverProfile, lives on `users`). */
async function getDriverAvatarSafe(db: Database, driverUserId: string): Promise<string | undefined> {
  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, driverUserId) });
    return user?.avatarUrl ?? undefined;
  } catch {
    return undefined;
  }
}

// M-070..075 (docs/unified_driver_and_passenger_journey.md §24, EDGE-055) —
// spec's own worked example: "Driver publishes Madrid -> Barcelona = EUR20.
// Passenger requests Zaragoza -> Barcelona. VAYA calculates a segment price,
// e.g. EUR10." Confirmed live (this pass) that this genuinely never
// happened — every booking, regardless of requested segment, paid
// `ride.contributionPerSeat * seatsRequested` unconditionally (the driver's
// full-route price), which is exactly what V-02/V-03's real HTTP journeys
// caught (`contributionTotal` equals the full-route price, not less).
//
// A tiny coordinate epsilon (~11m) treats "the ride's own origin/destination,
// resubmitted verbatim" as the full route — the common, already-correct
// case (V-01) — rather than recomputing a fresh price for it that could
// drift from the number the ride listing actually advertised (a driver may
// have adjusted `contributionPerSeat` away from the formula's own
// `recommended` value within its [min,max] bound, per Phase 6). A genuine
// sub-segment (a stop-based or free-form pickup/dropoff that differs from
// the ride's own endpoints) gets a fresh price computed directly from ITS
// OWN real segment distance/duration via the same `computeSuggestedPrice`
// formula and the ride's active pricing config — never scaled off the
// ride's own (possibly-adjusted) full-route price, matching the domain
// contract this pass already verified
// (compute-suggested-price.segment-pricing-contract.test.ts).
const FULL_ROUTE_ENDPOINT_EPSILON_DEG = 0.0001; // ~11m

function isSameCoordinate(aLat: number, aLng: number, bLat: number, bLng: number): boolean {
  return (
    Math.abs(aLat - bLat) < FULL_ROUTE_ENDPOINT_EPSILON_DEG &&
    Math.abs(aLng - bLng) < FULL_ROUTE_ENDPOINT_EPSILON_DEG
  );
}

async function computeBookingContributionTotal(
  db: Database,
  ride: Awaited<ReturnType<typeof getRideOrThrow>>,
  segment: {
    pickupStopId: string | null;
    pickupLat: number;
    pickupLng: number;
    dropoffStopId: string | null;
    dropoffLat: number | null;
    dropoffLng: number | null;
    seatsRequested: number;
  },
): Promise<number> {
  const resolvedDropoffLat = segment.dropoffLat ?? ride.destinationLat;
  const resolvedDropoffLng = segment.dropoffLng ?? ride.destinationLng;

  const isFullRouteBooking =
    !segment.pickupStopId &&
    !segment.dropoffStopId &&
    isSameCoordinate(segment.pickupLat, segment.pickupLng, ride.originLat, ride.originLng) &&
    isSameCoordinate(resolvedDropoffLat, resolvedDropoffLng, ride.destinationLat, ride.destinationLng);

  if (isFullRouteBooking) {
    return ride.contributionPerSeat * segment.seatsRequested;
  }

  const [pricingConfig, segmentRoute] = await Promise.all([
    getActivePricingConfig(db),
    getRoute(
      { lat: segment.pickupLat, lng: segment.pickupLng },
      { lat: resolvedDropoffLat, lng: resolvedDropoffLng },
    ),
  ]);
  const segmentPrice = computeSuggestedPrice(
    segmentRoute.distanceM / 1000,
    segmentRoute.durationSec / 60,
    pricingConfig,
    { isEstimate: segmentRoute.isEstimate },
  );
  return segmentPrice.recommended * segment.seatsRequested;
}

export async function createBooking(
  db: Database,
  rideId: string,
  riderId: string,
  input: CreateBookingInput,
) {
  const ride = await getRideOrThrow(db, rideId);

  // Each of these four rejections gets its own error code (rather than
  // reusing ConflictError/ForbiddenError's shared 'CONFLICT'/'FORBIDDEN'
  // codes) so the client can tell a genuine "someone else took the last
  // seat" race from "you already requested this" or "you can't book your
  // own ride" — collapsing them into one generic message actively misled
  // testers into thinking every rejection meant the seat was gone.
  if (ride.status !== 'published') {
    throw new AppError('This ride is no longer accepting requests', 409, 'RIDE_NOT_BOOKABLE');
  }
  // The segment-aware capacity pre-check (matching-engine architecture plan
  // §K) needs this request's actual resolved pickup/dropoff stop pair, so
  // it runs further down, once pickupStopId/dropoffStopId are known — see
  // the comment there for why a plain `ride.seatsAvailable` check here
  // would be wrong (it's now the ride's *bottleneck* segment, not "this
  // specific request's segment").
  // A driver can't book a seat on their own listing — this is the real,
  // server-side enforcement of that rule; the mobile client's own CTA
  // guard (ride-details.tsx) is a UI nicety, not what this depends on.
  if (ride.driverProfile.userId === riderId) {
    throw new AppError('You cannot request a seat on your own ride', 403, 'SELF_BOOKING_FORBIDDEN');
  }
  // One active request per rider per ride — declined/cancelled/expired
  // bookings don't block a fresh attempt, only a still-pending or
  // already-accepted one does.
  const existingActiveBooking = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.rideId, rideId),
      eq(bookings.riderId, riderId),
      inArray(bookings.status, ['pending', 'accepted']),
    ),
  });
  if (existingActiveBooking) {
    throw new AppError('You already have a request for this ride', 409, 'DUPLICATE_BOOKING');
  }

  // A ride with at least one driver-selected route_stop prefers booking via
  // pickupStopId/dropoffStopId — a real, driver-confirmed point (CLAUDE.md
  // product principle #1). Rides published before Phase 4 (zero
  // route_stops) keep the legacy free-form flow working unchanged, exactly
  // as before. A free-form pickup/dropoff on a ride that DOES have stops
  // is now also accepted (previously rejected outright) — but only after
  // assertRealDetourWithinAllowance's real, live routing-engine check
  // confirms it's a genuinely small, bounded detour: this is
  // matching.service.ts's detour_match tier's actual booking completion,
  // not a relaxation of the "never offer an unvalidated pickup" rule —
  // the validation is just a real routing call instead of "is this one of
  // the driver's pre-picked stops", equally real, never client-trusted.
  const selectedStops = await db.query.routeStops.findMany({
    where: and(eq(routeStops.rideId, rideId), eq(routeStops.isDriverSelected, true)),
  });

  let pickupStopId: string | null = null;
  let pickupLabel: string;
  let pickupLat: number;
  let pickupLng: number;
  let pickupWalkMeters: number | null = null;
  // M-083/084/EDGE-052/INV-09: the real extra-duration cost of THIS
  // booking's own free-form pickup and/or dropoff, if any — 0 for a
  // planned-stop resolution (no schedule change). Fed into
  // assertExistingPassengerImpactAcceptable below once both ends are
  // resolved, whichever leg (or both) actually detoured.
  let pickupDetourExtraDurationSeconds = 0;
  let dropoffDetourExtraDurationSeconds = 0;

  if (input.pickupStopId) {
    // Must belong to this exact ride and still be one of the driver's
    // actually-offered stops — `selectedStops` is already scoped to both,
    // so membership here is the whole check.
    const stop = selectedStops.find((s) => s.id === input.pickupStopId);
    if (!stop) {
      throw new ValidationError('Selected pickup stop is not offered on this ride');
    }
    pickupStopId = stop.id;
    pickupLabel = stop.label;
    pickupLat = stop.lat;
    pickupLng = stop.lng;
    // M-004/M-020: a real resolution step, not a blind pass-through of the
    // stop's own coordinate — see resolveStopWalkMeters's doc comment.
    // Skipped when the client didn't send its own requested point at all
    // (legacy client) — never a new rejection of an already-shipped
    // booking pattern.
    if (input.requestedPickup) {
      pickupWalkMeters = resolveStopWalkMeters(ride, input.requestedPickup, stop, 'pickup');
    }
  } else if (input.pickup) {
    pickupLabel = input.pickup.label;
    pickupLat = input.pickup.lat;
    pickupLng = input.pickup.lng;
    // Only the NEW capability (free-form pickup on a stops-having ride)
    // needs the live detour check — a zero-stop ride's free-form pickup
    // keeps behaving exactly as it always has (no distance bound), so an
    // already-shipped booking pattern is never newly rejected by this
    // change.
    if (selectedStops.length > 0) {
      const pickupImpact = await assertRealDetourWithinAllowance(db, ride, { lat: pickupLat, lng: pickupLng });
      pickupDetourExtraDurationSeconds = pickupImpact.extraDurationSeconds;
    }
  } else {
    throw new ValidationError('Pickup location is required');
  }

  // Dropoff selection (Phase 13, docs/roadmap/phase-13-search-engine.md):
  // mirrors pickup's validation, but always optional — a booking with no
  // dropoffStopId/dropoff simply drops the rider at the ride's own
  // destination, exactly as every booking behaved before either field
  // existed. `dropoff` (free-form coordinates) is a genuinely new
  // capability — there was no free-form dropoff shape at all before this
  // change — so it's always live-validated regardless of stop count,
  // never grandfathered against an existing unbounded behavior the way
  // free-form pickup on a zero-stop ride is above.
  let dropoffStopId: string | null = null;
  let dropoffLabel: string | null = null;
  let dropoffLat: number | null = null;
  let dropoffLng: number | null = null;
  let dropoffWalkMeters: number | null = null;

  if (input.dropoffStopId) {
    if (selectedStops.length === 0) {
      throw new ValidationError('This ride has no selectable dropoff stops');
    }
    const dropStop = selectedStops.find((s) => s.id === input.dropoffStopId);
    if (!dropStop) {
      throw new ValidationError('Selected dropoff stop is not offered on this ride');
    }
    // pickupStopId is only guaranteed set here when the pickup itself was
    // also stop-based — a free-form detour pickup paired with a real
    // dropoff stop is a real, valid combination (e.g. picked up off-route,
    // dropped off at a planned stop), so the sequence-order check only
    // applies when there's an actual pickup stop to compare against.
    const pickupStop = pickupStopId ? selectedStops.find((s) => s.id === pickupStopId) : undefined;
    if (pickupStop && dropStop.sequence <= pickupStop.sequence) {
      throw new ValidationError('Dropoff stop must come after the pickup stop on this route');
    }
    dropoffStopId = dropStop.id;
    dropoffLabel = dropStop.label;
    dropoffLat = dropStop.lat;
    dropoffLng = dropStop.lng;
    if (input.requestedDropoff) {
      dropoffWalkMeters = resolveStopWalkMeters(ride, input.requestedDropoff, dropStop, 'dropoff');
    }
  } else if (input.dropoff) {
    dropoffLabel = input.dropoff.label;
    dropoffLat = input.dropoff.lat;
    dropoffLng = input.dropoff.lng;
    const dropoffImpact = await assertRealDetourWithinAllowance(db, ride, { lat: dropoffLat, lng: dropoffLng });
    dropoffDetourExtraDurationSeconds = dropoffImpact.extraDurationSeconds;
  }

  // M-083/084/EDGE-052/INV-09 (spec §27, §62): only meaningful when this
  // booking itself introduced a genuine deviation — the helper's own
  // `totalDetourExtraDurationSeconds <= 0` guard makes the planned-stop
  // (majority) case a no-op read of two already-zero locals, not a real
  // extra query.
  if (pickupDetourExtraDurationSeconds > 0 || dropoffDetourExtraDurationSeconds > 0) {
    // Whichever end actually deviates first along the route — if only one
    // end is free-form, that's the sole deviation point; if both are, the
    // earlier of the two is where the driver first leaves the base route.
    const firstDeviationPoint =
      pickupDetourExtraDurationSeconds > 0 && dropoffDetourExtraDurationSeconds > 0 && ride.routePolyline
        ? (() => {
            const routePoints = decodePolyline(ride.routePolyline!);
            const pickupFraction = projectPointOntoRoute({ lat: pickupLat, lng: pickupLng }, routePoints).fraction;
            const dropoffFraction = projectPointOntoRoute(
              { lat: dropoffLat!, lng: dropoffLng! },
              routePoints,
            ).fraction;
            return pickupFraction <= dropoffFraction
              ? { lat: pickupLat, lng: pickupLng }
              : { lat: dropoffLat!, lng: dropoffLng! };
          })()
        : pickupDetourExtraDurationSeconds > 0
          ? { lat: pickupLat, lng: pickupLng }
          : { lat: dropoffLat!, lng: dropoffLng! };

    await assertExistingPassengerImpactAcceptable(
      db,
      ride,
      firstDeviationPoint,
      pickupDetourExtraDurationSeconds + dropoffDetourExtraDurationSeconds,
    );
  }

  // M-051/052 (docs/unified_driver_and_passenger_journey.md §20): "A
  // passenger may hold up to 3 active requests for the SAME journey... A
  // 4th request attempt for the same journey is rejected while 3 are
  // active." Checked against every OTHER ride's active (pending/accepted)
  // requests by this rider — same-ride duplicates are already rejected
  // above (DUPLICATE_BOOKING), this is specifically the cross-ride case.
  const requestedAt = new Date();
  const resolvedDropoffLatForGrouping = dropoffLat ?? ride.destinationLat;
  const resolvedDropoffLngForGrouping = dropoffLng ?? ride.destinationLng;
  // M-085/M-085a (spec §28): every threshold below is read from the
  // active admin config (falling back to @vaya/domain's own pure default
  // when nothing is configured yet) — never the bare imported constant
  // directly, so an admin change takes effect without a redeploy.
  const opConfig = await getActiveOperationalConfig(db);
  const riderOtherActiveBookings = await db.query.bookings.findMany({
    where: and(eq(bookings.riderId, riderId), inArray(bookings.status, ['pending', 'accepted'])),
    with: { ride: true },
  });
  const sameJourneySiblings = findSameJourneySiblings(
    {
      riderId,
      pickupLat,
      pickupLng,
      dropoffLat: resolvedDropoffLatForGrouping,
      dropoffLng: resolvedDropoffLngForGrouping,
      requestedAt,
    },
    riderOtherActiveBookings.map((b) => ({
      riderId: b.riderId,
      pickupLat: b.pickupLat,
      pickupLng: b.pickupLng,
      // A sibling booking with no free-form/stop dropoff defaults to ITS
      // OWN ride's destination — mirrors exactly how this same request's
      // resolvedDropoffLatForGrouping falls back above; never approximated
      // by the pickup point (that would conflate "no explicit dropoff" with
      // "an extremely short trip").
      dropoffLat: b.dropoffLat ?? b.ride.destinationLat,
      dropoffLng: b.dropoffLng ?? b.ride.destinationLng,
      requestedAt: b.requestedAt,
    })),
    {
      pickupRadiusMeters: opConfig.sameJourneyPickupRadiusMeters,
      dropoffRadiusMeters: opConfig.sameJourneyDropoffRadiusMeters,
      timeWindowMinutes: opConfig.sameJourneyTimeWindowMinutes,
    },
  );
  if (sameJourneySiblings.length >= opConfig.maxActiveRequestsPerJourney) {
    throw new AppError(
      `You already have ${opConfig.maxActiveRequestsPerJourney} active requests for this journey`,
      409,
      'TOO_MANY_ACTIVE_REQUESTS_FOR_JOURNEY',
    );
  }

  // Segment-aware capacity pre-check (matching-engine architecture plan
  // §K) — advisory only, same "a stale read here is fine" posture the
  // scalar check it replaces always had: the real, atomic enforcement
  // point is always acceptBooking below. Built from this request's actual
  // resolved pickup/dropoff stop pair (sequenceByStopId is free — reuses
  // `selectedStops`, already fetched above, no extra query) rather than
  // the ride-global `seatsAvailable` scalar, so a genuinely free
  // non-overlapping segment is never rejected here just because a
  // different segment elsewhere on the ride happens to be saturated.
  const sequenceByStopId = new Map(selectedStops.map((s) => [s.id, s.sequence]));
  const candidateSegment: BookingSegment = {
    seatsRequested: input.seatsRequested,
    pickupSequence: pickupStopId ? (sequenceByStopId.get(pickupStopId) ?? -Infinity) : -Infinity,
    dropoffSequence: dropoffStopId ? (sequenceByStopId.get(dropoffStopId) ?? Infinity) : Infinity,
  };
  const existingSegments = await loadAcceptedSegments(db, rideId);
  if (wouldExceedCapacity(existingSegments, candidateSegment, ride.seatsTotal)) {
    throw new AppError(
      'Not enough seats available for this segment of the route',
      409,
      'SEATS_UNAVAILABLE',
    );
  }

  const contributionTotal = await computeBookingContributionTotal(db, ride, {
    pickupStopId,
    pickupLat,
    pickupLng,
    dropoffStopId,
    dropoffLat,
    dropoffLng,
    seatsRequested: input.seatsRequested,
  });

  const [booking] = await db
    .insert(bookings)
    .values({
      rideId,
      riderId,
      seatsRequested: input.seatsRequested,
      contributionTotal,
      status: 'pending',
      pickupStopId,
      pickupLabel,
      pickupLat,
      pickupLng,
      pickupWalkMeters,
      dropoffStopId,
      dropoffLabel,
      dropoffLat,
      dropoffLng,
      dropoffWalkMeters,
      // M-054 (spec §20): "Every request has a server-authoritative
      // response deadline, visible to passenger immediately post-request
      // and to driver inside the incoming request." Confirmed live (this
      // pass) that no such field previously existed anywhere in this
      // codebase — not persisted, not returned, not enforced.
      requestedAt,
      expiresAt: computeBookingExpiresAt(requestedAt, opConfig.bookingResponseWindowMinutes),
    })
    .returning();
  if (!booking) throw new Error('Failed to create booking');

  const riderProfileForNotif = await getRiderNotificationProfileSafe(db, riderId);
  await notifyBestEffort(db, ride.driverProfile.userId, 'booking_requested', {
    bookingId: booking.id,
    rideId,
    riderId,
    riderName: riderProfileForNotif.fullName,
    riderAvatarUrl: riderProfileForNotif.avatarUrl,
    riderRatingAvg: riderProfileForNotif.ratingAvg,
    seatsRequested: booking.seatsRequested,
    pickupLabel: booking.pickupLabel,
    originLabel: ride.originLabel,
    destinationLabel: ride.destinationLabel,
    departureAt: ride.departureAt.toISOString(),
  });

  return booking;
}

export async function listMyBookings(db: Database, riderId: string) {
  const results = await db.query.bookings.findMany({
    where: eq(bookings.riderId, riderId),
    with: { ride: { with: { driverProfile: { with: { user: true } } } } },
  });

  // Flatten ride.driverProfile.user.fullName -> ride.driverFullName so it
  // matches bookingResponseSchema's shape — Zod strips unknown keys but
  // can't reach into nested paths for you.
  return results.map(({ ride, ...booking }) => ({
    ...booking,
    ride: {
      originLabel: ride.originLabel,
      destinationLabel: ride.destinationLabel,
      departureAt: ride.departureAt,
      contributionPerSeat: ride.contributionPerSeat,
      driverFullName: ride.driverProfile.user?.fullName ?? null,
      driverUserId: ride.driverProfile.userId,
      // (tabs)/trips.tsx's rider hero card needs this to tell an actually
      // in-progress ride apart from a merely-scheduled one — the booking's
      // own status stays 'accepted' throughout both, so it can't say this
      // on its own.
      status: ride.status,
    },
  }));
}

export async function listRequestsForRide(db: Database, rideId: string, requestingUserId: string) {
  const ride = await getRideOrThrow(db, rideId);
  if (ride.driverProfile.userId !== requestingUserId) {
    throw new ForbiddenError('Only the driver can view requests for this ride');
  }
  const results = await db.query.bookings.findMany({
    where: eq(bookings.rideId, rideId),
    with: { rider: true },
  });

  // Flatten booking.rider -> booking.rider {id, fullName, avatarUrl} so the
  // driver's request list can show WHO is asking (same additive-display
  // pattern as listMyBookings's ride enrichment above — driver-facing
  // endpoint; fellow-passengers' public-safe first-name-only rule doesn't
  // apply here).
  return results.map(({ rider, ...booking }) => ({
    ...booking,
    rider: {
      id: rider.id,
      fullName: rider.fullName,
      avatarUrl: rider.avatarUrl,
    },
  }));
}

/** Public, first-name-only roster of a ride's already-*accepted* fellow
 *  passengers — for search/ride-details.tsx and results.tsx's ride cards,
 *  which show "N seats booked" alongside who's already on board (matches
 *  the same public-safe exposure level the driver's own public profile
 *  already uses: first name + rating, never a full identity, phone, or
 *  pending/declined requests). */
export async function listFellowPassengers(db: Database, rideId: string) {
  const accepted = await db.query.bookings.findMany({
    where: and(eq(bookings.rideId, rideId), eq(bookings.status, 'accepted')),
    with: { rider: { with: { riderProfile: true } } },
  });
  return accepted.map((booking) => ({
    userId: booking.rider.id,
    firstName: booking.rider.fullName.split(' ')[0]!,
    avatarUrl: booking.rider.avatarUrl,
    ratingAvg: booking.rider.riderProfile?.ratingAvg ?? 0,
  }));
}

export async function acceptBooking(db: Database, bookingId: string, requestingUserId: string) {
  const booking = await getBookingOrThrow(db, bookingId);
  if (booking.ride.driverProfile.userId !== requestingUserId) {
    throw new ForbiddenError('Only the driver can accept this request');
  }
  if (!canTransitionBookingStatus(booking.status, 'accepted')) {
    throw new ConflictError(`Cannot accept a booking in status "${booking.status}"`);
  }
  const opConfig = await getActiveOperationalConfig(db);

  // Segment-aware, atomic check-then-accept (matching-engine architecture
  // plan §K): the whole thing runs inside one transaction that locks the
  // ride row first (`SELECT ... FOR UPDATE`), the generalization of the
  // old flat `UPDATE rides SET seatsAvailable = seatsAvailable - N WHERE
  // seatsAvailable >= N` guard to a capacity check that can't be expressed
  // as a single UPDATE's WHERE clause (it depends on every other accepted
  // booking's own span, not just one scalar column). Postgres's row lock
  // gives the same "only the first writer to commit wins" guarantee that
  // guard did — a concurrent accept on the same ride blocks here until
  // this transaction commits or rolls back, then re-reads the
  // now-committed accepted-booking set, so two concurrent accepts can
  // never both pass a capacity check computed against the same stale set.
  const updated_ = await db.transaction(async (tx) => {
    const [lockedRide] = await tx.select().from(rides).where(eq(rides.id, booking.rideId)).for('update');
    if (!lockedRide) throw new NotFoundError('Ride');

    const existingSegments = await loadAcceptedSegments(tx, booking.rideId);
    const stops = await tx.query.routeStops.findMany({ where: eq(routeStops.rideId, booking.rideId) });
    const sequenceByStopId = new Map(stops.map((s) => [s.id, s.sequence]));
    const candidateSegment = bookingToSegment(booking, sequenceByStopId);

    if (wouldExceedCapacity(existingSegments, candidateSegment, lockedRide.seatsTotal)) {
      throw new ConflictError('Not enough seats remaining for this segment of the route');
    }

    const [acceptedBooking] = await tx
      .update(bookings)
      .set({ status: 'accepted', respondedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, booking.status)))
      .returning();
    if (!acceptedBooking) {
      throw new ConflictError(`Cannot accept a booking in status "${booking.status}"`);
    }

    // Recomputed AFTER the booking above is persisted, so this read of the
    // accepted-booking set already includes it.
    await recomputeAndPersistRideCapacity(tx, lockedRide);

    await tx
      .insert(trips)
      .values({ bookingId: acceptedBooking.id, rideId: acceptedBooking.rideId, status: 'scheduled' });

    // M-055/056/INV-03 (docs/unified_driver_and_passenger_journey.md §20,
    // §62 hard invariant): "First acceptance wins: accepting Driver A
    // confirms it and auto-cancels/closes all other pending requests for
    // the same journey." Runs inside this same transaction — the accept
    // and the sibling-closure are one atomic unit, so a passenger can never
    // observe (or a concurrent accept on a sibling ride ever act on) a
    // state where this booking is accepted but a same-journey sibling is
    // still openly pending.
    const otherActiveBookings = await tx.query.bookings.findMany({
      where: and(
        eq(bookings.riderId, acceptedBooking.riderId),
        eq(bookings.status, 'pending'),
        ne(bookings.id, acceptedBooking.id),
      ),
      with: { ride: true },
    });
    const supersededSiblings = findSameJourneySiblings(
      {
        riderId: acceptedBooking.riderId,
        pickupLat: acceptedBooking.pickupLat,
        pickupLng: acceptedBooking.pickupLng,
        dropoffLat: acceptedBooking.dropoffLat ?? lockedRide.destinationLat,
        dropoffLng: acceptedBooking.dropoffLng ?? lockedRide.destinationLng,
        requestedAt: acceptedBooking.requestedAt,
      },
      otherActiveBookings.map((b) => ({
        id: b.id,
        riderId: b.riderId,
        pickupLat: b.pickupLat,
        pickupLng: b.pickupLng,
        dropoffLat: b.dropoffLat ?? b.ride.destinationLat,
        dropoffLng: b.dropoffLng ?? b.ride.destinationLng,
        requestedAt: b.requestedAt,
      })),
      {
        pickupRadiusMeters: opConfig.sameJourneyPickupRadiusMeters,
        dropoffRadiusMeters: opConfig.sameJourneyDropoffRadiusMeters,
        timeWindowMinutes: opConfig.sameJourneyTimeWindowMinutes,
      },
    );
    if (supersededSiblings.length > 0) {
      await tx
        .update(bookings)
        .set({ status: 'superseded', respondedAt: new Date(), updatedAt: new Date() })
        .where(
          inArray(
            bookings.id,
            supersededSiblings.map((s) => s.id),
          ),
        );
    }

    return { acceptedBooking, supersededSiblings };
  });
  const { acceptedBooking: updated, supersededSiblings } = updated_;

  await notifyBestEffort(db, booking.riderId, 'booking_accepted', {
    bookingId: booking.id,
    rideId: booking.rideId,
    driverUserId: booking.ride.driverProfile.userId,
    driverName: await getUserFullNameSafe(db, booking.ride.driverProfile.userId),
    driverAvatarUrl: await getDriverAvatarSafe(db, booking.ride.driverProfile.userId),
    driverRatingAvg: booking.ride.driverProfile.ratingAvg,
    originLabel: booking.ride.originLabel,
    destinationLabel: booking.ride.destinationLabel,
    departureAt: booking.ride.departureAt.toISOString(),
  });

  // M-055 (spec §20): the rider whose other requests were just closed by
  // this acceptance is told why — never a silent status flip they'd only
  // discover by happening to reopen the app.
  for (const sibling of supersededSiblings) {
    await notifyBestEffort(db, booking.riderId, 'booking_declined', {
      bookingId: sibling.id,
      rideId: booking.rideId,
      reason: 'superseded_by_accepted_sibling',
      originLabel: booking.ride.originLabel,
      destinationLabel: booking.ride.destinationLabel,
    });
  }

  // Phase 8: one conversation per booking, opened the moment it's
  // accepted — see conversations.service.ts's doc comment for why this is
  // best-effort and idempotent.
  await createConversationBestEffort(db, booking.id);

  return updated;
}

export async function declineBooking(db: Database, bookingId: string, requestingUserId: string) {
  const booking = await getBookingOrThrow(db, bookingId);
  if (booking.ride.driverProfile.userId !== requestingUserId) {
    throw new ForbiddenError('Only the driver can decline this request');
  }
  if (!canTransitionBookingStatus(booking.status, 'declined')) {
    throw new ConflictError(`Cannot decline a booking in status "${booking.status}"`);
  }

  const [updated] = await db
    .update(bookings)
    .set({ status: 'declined', respondedAt: new Date(), updatedAt: new Date() })
    .where(eq(bookings.id, bookingId))
    .returning();
  if (!updated) throw new Error('Failed to decline booking');

  await notifyBestEffort(db, booking.riderId, 'booking_declined', {
    bookingId: booking.id,
    rideId: booking.rideId,
    driverUserId: booking.ride.driverProfile.userId,
    driverName: await getUserFullNameSafe(db, booking.ride.driverProfile.userId),
    originLabel: booking.ride.originLabel,
    destinationLabel: booking.ride.destinationLabel,
  });

  return updated;
}

/**
 * Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md): a read-only
 * preview of the policy tier/consequence that would apply *right now* —
 * backs `GET /bookings/:bookingId/cancellation-preview`, called by the
 * mobile cancellation sheet before the user commits, so the consequence is
 * shown *before* confirming (the phase doc's explicit UX requirement), not
 * discovered only after the destructive POST. `cancelBooking` below
 * independently recomputes the same policy at the moment it actually
 * mutates anything — this preview is advisory only and never itself
 * changes any state, so a stale preview (the user waited a while before
 * confirming) can never desync from what actually gets applied.
 */
export async function previewBookingCancellation(
  db: Database,
  bookingId: string,
  requestingUserId: string,
): Promise<CancellationPolicyResult> {
  const booking = await getBookingOrThrow(db, bookingId);
  const isRider = booking.riderId === requestingUserId;
  const isDriver = booking.ride.driverProfile.userId === requestingUserId;
  if (!isRider && !isDriver) {
    throw new ForbiddenError('Not authorized to view this booking');
  }

  const nextStatus = isRider ? 'cancelled_by_rider' : 'cancelled_by_driver';
  if (!canTransitionBookingStatus(booking.status, nextStatus)) {
    throw new ConflictError(`Cannot cancel a booking in status "${booking.status}"`);
  }
  await assertTripNotStarted(db, booking.id);

  const opConfig = await getActiveOperationalConfig(db);
  return computeCancellationPolicy(
    booking.ride.departureAt,
    new Date(),
    opConfig.cancellationFreeWindowHours,
    opConfig.cancellationModerateWindowMinutes,
  );
}

export interface DetourPreviewPoint {
  label: string;
  lat: number;
  lng: number;
  /** True when this point is one of the driver's own route_stops (or the
   *  ride's own destination) — meaning it was already part of the route the
   *  driver committed to when publishing, so accepting this request adds no
   *  real detour beyond what's already stored/definitional. False only for
   *  a free-form point on a legacy (zero-route_stops) ride, where a genuine
   *  detour is possible and is computed live below. */
  isPlannedStop: boolean;
  deviationMeters: number | null;
  deviationSeconds: number | null;
  /** 1-based position among the ride's selected stops (pickup ordering),
   *  or null when this point isn't one of them. */
  stopIndex: number | null;
  totalStops: number | null;
}

export interface DetourPreview {
  pickup: DetourPreviewPoint;
  dropoff: DetourPreviewPoint;
  /** The passenger's actual ride: pickup -> dropoff, real routed distance/
   *  duration (not the whole ride's, since a route-passthrough booking only
   *  ever rides part of it). */
  segment: { distanceM: number; durationSec: number; isEstimate: boolean };
  /** Real ISO time the driver would reach this passenger's pickup point —
   *  ride.departureAt plus a real route-fraction offset (mirrors
   *  matching.service.ts's pickupEtaSeconds on the passenger/search side —
   *  same reasoning, same honest approximation where no per-leg routing
   *  breakdown exists). Direct product feedback: showing only a distance/
   *  duration deviation, with no actual clock time, left the driver unable
   *  to tell *when* they'd meet this passenger. */
  pickupTime: string;
  /** Dropoff-side mirror of `pickupTime`. */
  dropoffTime: string;
  /** Real ISO time the driver's OWN trip would finish if they accept this
   *  request — distinct from `dropoffTime` (the passenger's own stop):
   *  ride.departureAt plus the ride's baseline duration, plus this
   *  specific request's real extra detour cost (0 when both pickup and
   *  dropoff are planned stops — already priced into the published
   *  route). Direct product feedback: the driver needs to see how
   *  accepting shifts their own schedule, not just the passenger's. */
  newEta: string;
  /** Real routing-engine polyline for the passenger's own pickup ->
   *  dropoff leg, populated only when at least one point isn't a planned
   *  stop — mirrors MatchCandidate.detourRoutePolyline
   *  (matching.service.ts) on the passenger side, fixing the same class of
   *  bug on the driver's map: slicing the ride's own `routePolyline`
   *  between a point that isn't actually on it would show the wrong line.
   *  Null when both points are planned stops, where the existing
   *  route-slice approach is already exactly right. */
  detourRoutePolyline: string | null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export interface PickupOverridePreview {
  /** Real distance from the passenger's own actual point (when supplied)
   *  to the override point being previewed — the same walk-distance
   *  concept M-004/M-020's resolveStopWalkMeters already persists for a
   *  stop-based pickup, computed here before commit instead of after.
   *  Null when no requestedPoint was supplied (nothing to measure walk
   *  distance from). */
  walkMeters: number | null;
  driverDetourExtraSeconds: number | null;
  driverDetourAllowanceSeconds: number | null;
  /** Null when feasibility genuinely couldn't be computed right now (this
   *  ride has no route yet, or the routing engine is unreachable/
   *  estimate-only) — never fabricated as true or false in that case. */
  withinAllowance: boolean | null;
}

/**
 * M-040/EDGE-053 (docs/unified_driver_and_passenger_journey.md §14, edge
 * 53): "Passenger can override to another VAYA-feasible point; VAYA
 * recalculates walk/PT/detour/ETA/feasibility and informs (not blocks)
 * when worse for driver." Before this function, a passenger choosing to
 * override away from one of the driver's recommended `route_stops` (the
 * free-form `pickup`/`dropoff` path createBooking already accepts once a
 * ride has stops — see assertRealDetourWithinAllowance) had no way to see
 * the real consequence of that choice before actually submitting the
 * request; the recalculation only ever happened inside createBooking
 * itself, either silently succeeding or throwing a 400 with no prior
 * warning. This is the read-only preview step EDGE-053 names ("consequence
 * shown... before the destructive action"), mirroring
 * previewBookingCancellation's existing GET-before-POST pattern.
 *
 * Deliberately never throws for an out-of-bounds point — `withinAllowance:
 * false` is a real, honest answer the passenger can still act on (submit
 * anyway if genuinely willing, or pick a different point); createBooking's
 * own assertRealDetourWithinAllowance remains the one place that actually
 * enforces the hard bound at commit time, so this preview can never itself
 * become a second, differently-behaved gate — "request still allowed" per
 * EDGE-053 stays true regardless of what this preview shows.
 */
export async function previewPickupOverride(
  db: Database,
  rideId: string,
  point: { lat: number; lng: number },
  requestedPoint?: { lat: number; lng: number },
): Promise<PickupOverridePreview> {
  const ride = await getRideOrThrow(db, rideId);
  const impact = await computeDetourImpact(db, ride, point);
  return {
    walkMeters: requestedPoint ? haversineDistanceMeters(requestedPoint, point) : null,
    driverDetourExtraSeconds: impact ? Math.round(impact.extraDurationSeconds) : null,
    driverDetourAllowanceSeconds: impact ? Math.round(impact.allowanceSeconds) : null,
    withinAllowance: impact ? impact.withinAllowance : null,
  };
}

/**
 * "Does this request fit my route?" — the driver-facing detour/route-fit
 * summary backing the request-detail sheet (a world-class carpooling app's
 * table-stakes accept/decline signal: BlaBlaCar/Uber-style "this adds X min
 * to your trip"). The key insight this codebase's own architecture already
 * gives away for free: a booking's pickupStopId/dropoffStopId, when set,
 * must be one of the driver's own route_stops (bookings.service.ts's
 * createBooking enforces this at request time) — and every route_stop's
 * `deviationMeters`/`deviationSeconds` was already computed once, honestly,
 * when the driver published the ride (stop-candidates.service.ts). So the
 * normal, stop-based booking flow's per-point deviation labels below never
 * need a fresh routing call — they just surface data that already exists.
 * A live getRoute detour computation runs for the per-point deviation only
 * when a point is genuinely free-form (a legacy zero-stop ride's free pin,
 * or — matching-engine detour_match's booking completion — a real,
 * live-validated detour pickup/dropoff on a ride that DOES have stops,
 * createBooking's own assertRealDetourWithinAllowance already having
 * accepted it once at request time). A SECOND, combined routing call
 * (origin -> pickup -> dropoff -> destination together, not each point in
 * isolation) only runs when at least one point isn't a planned stop —
 * that's what produces `newEta`/`detourRoutePolyline` and both points'
 * real ETAs from one consistent route, instead of summing two independent
 * hypothetical single-point insertions that wouldn't necessarily add up
 * correctly.
 */
export async function previewBookingDetour(
  db: Database,
  bookingId: string,
  requestingUserId: string,
): Promise<DetourPreview> {
  const booking = await getBookingOrThrow(db, bookingId);
  if (booking.ride.driverProfile.userId !== requestingUserId) {
    throw new ForbiddenError('Only the driver can preview this request');
  }

  const selectedStops = await db.query.routeStops.findMany({
    where: and(eq(routeStops.rideId, booking.rideId), eq(routeStops.isDriverSelected, true)),
    orderBy: (stops, { asc }) => [asc(stops.sequence)],
  });
  const totalStops = selectedStops.length > 0 ? selectedStops.length : null;

  async function resolveFreeformPoint(lat: number, lng: number): Promise<{
    deviationMeters: number;
    deviationSeconds: number;
  }> {
    const [baseline, withDetour] = await Promise.all([
      getRoute(
        { lat: booking!.ride.originLat, lng: booking!.ride.originLng },
        { lat: booking!.ride.destinationLat, lng: booking!.ride.destinationLng },
      ),
      getRoute(
        { lat: booking!.ride.originLat, lng: booking!.ride.originLng },
        { lat: booking!.ride.destinationLat, lng: booking!.ride.destinationLng },
        [{ lat, lng }],
      ),
    ]);
    return {
      deviationMeters: Math.max(0, Math.round(withDetour.distanceM - baseline.distanceM)),
      deviationSeconds: Math.max(0, Math.round(withDetour.durationSec - baseline.durationSec)),
    };
  }

  async function resolvePickup(): Promise<DetourPreviewPoint> {
    if (booking.pickupStopId) {
      const index = selectedStops.findIndex((s) => s.id === booking.pickupStopId);
      const stop = index >= 0 ? selectedStops[index] : undefined;
      return {
        label: booking.pickupLabel,
        lat: booking.pickupLat,
        lng: booking.pickupLng,
        isPlannedStop: true,
        deviationMeters: stop?.deviationMeters ?? 0,
        deviationSeconds: stop?.deviationSeconds ?? 0,
        stopIndex: index >= 0 ? index + 1 : null,
        totalStops,
      };
    }
    const detour = await resolveFreeformPoint(booking.pickupLat, booking.pickupLng);
    return {
      label: booking.pickupLabel,
      lat: booking.pickupLat,
      lng: booking.pickupLng,
      isPlannedStop: false,
      ...detour,
      stopIndex: null,
      totalStops: null,
    };
  }

  async function resolveDropoff(): Promise<DetourPreviewPoint> {
    if (booking.dropoffStopId) {
      const index = selectedStops.findIndex((s) => s.id === booking.dropoffStopId);
      const stop = index >= 0 ? selectedStops[index] : undefined;
      return {
        label: booking.dropoffLabel ?? booking.ride.destinationLabel,
        lat: booking.dropoffLat ?? booking.ride.destinationLat,
        lng: booking.dropoffLng ?? booking.ride.destinationLng,
        isPlannedStop: true,
        deviationMeters: stop?.deviationMeters ?? 0,
        deviationSeconds: stop?.deviationSeconds ?? 0,
        stopIndex: index >= 0 ? index + 1 : null,
        totalStops,
      };
    }
    if (booking.dropoffLat === null || booking.dropoffLng === null) {
      // No dropoff stop was chosen -- the rider ends the trip at the ride's
      // own destination, which is trivially on-route by definition, not
      // something to run through a live detour computation.
      return {
        label: booking.ride.destinationLabel,
        lat: booking.ride.destinationLat,
        lng: booking.ride.destinationLng,
        isPlannedStop: true,
        deviationMeters: 0,
        deviationSeconds: 0,
        stopIndex: null,
        totalStops,
      };
    }
    // A real free-form dropoff (matching-engine detour_match's booking
    // completion, or a legacy zero-stop ride) — createBooking already
    // real-validated this via assertRealDetourWithinAllowance at request
    // time; computed live here again for this preview's own honest,
    // independent numbers.
    const detour = await resolveFreeformPoint(booking.dropoffLat, booking.dropoffLng);
    return {
      label: booking.dropoffLabel!,
      lat: booking.dropoffLat,
      lng: booking.dropoffLng,
      isPlannedStop: false,
      ...detour,
      stopIndex: null,
      totalStops: null,
    };
  }

  const [pickup, dropoff] = await Promise.all([resolvePickup(), resolveDropoff()]);
  const segment = await getRoute(
    { lat: booking.pickupLat, lng: booking.pickupLng },
    { lat: dropoff.lat, lng: dropoff.lng },
  );

  const ride = booking.ride;
  const departureAtMs = ride.departureAt.getTime();
  let pickupTimeMs = departureAtMs;
  let dropoffTimeMs = departureAtMs;
  let newEtaMs = ride.estimatedDurationSec ? departureAtMs + ride.estimatedDurationSec * 1000 : departureAtMs;
  let detourRoutePolyline: string | null = null;

  if (ride.routePolyline && ride.estimatedDurationSec) {
    if (pickup.isPlannedStop && dropoff.isPlannedStop) {
      // Both points are already on the ride's own published route — the
      // exact same real-fraction-of-real-duration approximation
      // matching.service.ts's route_passthrough tier uses, no extra
      // routing call needed since nothing about the route itself changes.
      const routePoints = decodePolyline(ride.routePolyline);
      const pickupFraction = clamp01(projectPointOntoRoute({ lat: pickup.lat, lng: pickup.lng }, routePoints).fraction);
      const dropoffFraction = clamp01(
        projectPointOntoRoute({ lat: dropoff.lat, lng: dropoff.lng }, routePoints).fraction,
      );
      pickupTimeMs = departureAtMs + ride.estimatedDurationSec * pickupFraction * 1000;
      dropoffTimeMs = departureAtMs + ride.estimatedDurationSec * dropoffFraction * 1000;
      // newEtaMs already defaults to the ride's own baseline arrival —
      // correct here, both points add no real extra time.
    } else {
      // At least one point is a real detour — one combined routing call
      // (both waypoints together, in order) gives a single consistent
      // route to derive everything from, rather than summing two
      // independent single-point insertions that wouldn't necessarily add
      // up to the same real route.
      const withDetour = await getRoute(
        { lat: ride.originLat, lng: ride.originLng },
        { lat: ride.destinationLat, lng: ride.destinationLng },
        [
          { lat: pickup.lat, lng: pickup.lng },
          { lat: dropoff.lat, lng: dropoff.lng },
        ],
      );
      if (!withDetour.isEstimate) {
        const withDetourPoints = decodePolyline(withDetour.polyline);
        const pickupFraction = clamp01(
          projectPointOntoRoute({ lat: pickup.lat, lng: pickup.lng }, withDetourPoints).fraction,
        );
        const dropoffFraction = clamp01(
          projectPointOntoRoute({ lat: dropoff.lat, lng: dropoff.lng }, withDetourPoints).fraction,
        );
        pickupTimeMs = departureAtMs + withDetour.durationSec * pickupFraction * 1000;
        dropoffTimeMs = departureAtMs + withDetour.durationSec * dropoffFraction * 1000;
        newEtaMs = departureAtMs + withDetour.durationSec * 1000;
        detourRoutePolyline = withDetour.polyline;
      }
      // Routing engine unreachable: pickupTimeMs/dropoffTimeMs/newEtaMs
      // stay at their honest departureAt/baseline-duration defaults above
      // rather than a fabricated detour-adjusted number — the per-point
      // deviation labels already show isEstimate for this same case.
    }
  }

  return {
    pickup,
    dropoff,
    segment: { distanceM: segment.distanceM, durationSec: segment.durationSec, isEstimate: segment.isEstimate },
    pickupTime: new Date(pickupTimeMs).toISOString(),
    dropoffTime: new Date(dropoffTimeMs).toISOString(),
    newEta: new Date(newEtaMs).toISOString(),
    detourRoutePolyline,
  };
}

export async function cancelBooking(
  db: Database,
  bookingId: string,
  requestingUserId: string,
  reason: CancellationReason,
) {
  // M-110 (docs/unified_driver_and_passenger_journey.md §38): enforced here
  // too, not just by the route's Zod schema — a direct service-level caller
  // (another module, a future admin action) must not be able to bypass the
  // "required reason from a fixed set" rule the HTTP boundary enforces.
  if (!CANCELLATION_REASONS.includes(reason)) {
    throw new ValidationError('A valid cancellation reason is required');
  }

  const booking = await getBookingOrThrow(db, bookingId);
  const isRider = booking.riderId === requestingUserId;
  const isDriver = booking.ride.driverProfile.userId === requestingUserId;
  if (!isRider && !isDriver) {
    throw new ForbiddenError('Not authorized to cancel this booking');
  }

  const nextStatus = isRider ? 'cancelled_by_rider' : 'cancelled_by_driver';
  if (!canTransitionBookingStatus(booking.status, nextStatus)) {
    throw new ConflictError(`Cannot cancel a booking in status "${booking.status}"`);
  }
  await assertTripNotStarted(db, booking.id);

  // Phase 10: the policy tier is computed once, at the instant this
  // cancellation actually happens, and reused for both the reputation
  // consequence applied below and the response the client renders — never
  // recomputed a second time against a possibly-later clock read.
  const cancelledAt = new Date();
  const opConfig = await getActiveOperationalConfig(db);
  const cancellationPolicy = computeCancellationPolicy(
    booking.ride.departureAt,
    cancelledAt,
    opConfig.cancellationFreeWindowHours,
    opConfig.cancellationModerateWindowMinutes,
  );

  // Phase 10: atomic, database-level check-and-transition — mirrors
  // acceptBooking's discipline above. The original cancelBooking (Phase 1
  // through Phase 9) guarded this transition only with the
  // canTransitionBookingStatus check against the *stale* `booking` read a
  // few lines up, then updated unconditionally by id alone. Two concurrent
  // cancel calls on the same booking (e.g. rider and driver racing to
  // cancel at once) could both pass that stale check and both "succeed",
  // and — worse — both then take the `booking.status === 'accepted'`
  // branch below and each restore a seat, double-crediting
  // `seatsAvailable` for a single freed seat. Re-validating `status` in the
  // WHERE clause closes that window exactly the way acceptBooking's
  // conditional seat decrement does: only the first writer to commit can
  // match; the loser's WHERE matches zero rows and gets a clean
  // ConflictError instead of silently corrupting seat counts.
  //
  // Segment-aware seat restoration (matching-engine architecture plan §K):
  // the old flat `LEAST(seatsAvailable + N, seatsTotal)` restore assumed
  // the cancelled booking was always the ride's bottleneck, which isn't
  // true anymore — recomputeAndPersistRideCapacity recomputes from the
  // remaining accepted bookings from scratch instead (same "never
  // increment/decrement a derived number" discipline as the rating
  // aggregate). Runs inside one transaction that locks the ride row FIRST,
  // before the booking status transition — the same lock ordering
  // acceptBooking uses, so concurrent accept/cancel/no-show calls against
  // the same ride can never deadlock against each other.
  const updated = await db.transaction(async (tx) => {
    const [lockedRide] = await tx.select().from(rides).where(eq(rides.id, booking.rideId)).for('update');
    if (!lockedRide) throw new NotFoundError('Ride');

    const [updatedBooking] = await tx
      .update(bookings)
      .set({
        status: nextStatus,
        cancellationReason: reason,
        respondedAt: cancelledAt,
        updatedAt: cancelledAt,
      })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, booking.status)))
      .returning();
    if (!updatedBooking) {
      throw new ConflictError(`Cannot cancel a booking in status "${booking.status}"`);
    }

    if (booking.status === 'accepted') {
      // Recomputed AFTER the status transition above, so this already
      // excludes the just-cancelled booking from the accepted set.
      await recomputeAndPersistRideCapacity(tx, lockedRide);
      await tx
        .update(trips)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(trips.bookingId, booking.id));
    }

    return updatedBooking;
  });

  if (booking.status === 'accepted') {
    // Phase 8: the trip just became terminal, so its conversation (if any —
    // only accepted bookings ever have one) becomes permanently read-only.
    // Best-effort cache refresh only: sendMessage/getAuthorizedConversation
    // always re-derive closed state live from the trip's own status
    // regardless of whether this call succeeds.
    await closeConversationBestEffort(db, booking.id);
  }

  // Phase 10: reputation-only consequence for the *cancelling* party (no
  // payment system exists to refund against — docs/domain/cancellation-policy.md).
  // A no-op for the free tier (0 points).
  await applyCancellationPenalty(db, requestingUserId, isDriver, cancellationPolicy.penaltyPoints);

  const otherPartyUserId = isRider ? booking.ride.driverProfile.userId : booking.riderId;
  await notifyBestEffort(db, otherPartyUserId, 'booking_cancelled', {
    bookingId: booking.id,
    rideId: booking.rideId,
    cancelledBy: isRider ? 'rider' : 'driver',
    // Email dispatch (notifications/email-templates.ts's
    // renderBookingCancelled) only ever emails the driver, and only for a
    // booking that had actually reached `accepted` before this
    // cancellation — a still-pending request being withdrawn is not the
    // "confirmed booking canceled" case product asked for.
    recipientRole: isRider ? 'driver' : 'rider',
    wasConfirmed: booking.status === 'accepted',
    cancelledByName: await getUserFullNameSafe(
      db,
      isRider ? booking.riderId : booking.ride.driverProfile.userId,
    ),
    originLabel: booking.ride.originLabel,
    destinationLabel: booking.ride.destinationLabel,
    departureAt: booking.ride.departureAt.toISOString(),
    tier: cancellationPolicy.tier,
  });

  return { booking: updated, cancellationPolicy };
}

export interface BookingExpirySweepResult {
  scanned: number;
  expired: number;
}

/**
 * M-058 (docs/unified_driver_and_passenger_journey.md §20): "Request
 * expiry closes only that request automatically; siblings continue."
 * Periodic sweep (BOOKING_EXPIRY_SWEEP_JOB_NAME, lib/queue.ts — a fourth
 * job type on the same one BullMQ queue every other periodic sweep in this
 * codebase already reuses) — transitions any `pending` booking whose
 * `expiresAt` has passed to `expired`. Deliberately only ever touches the
 * ONE expiring booking's own row: no cascade, no capacity release (a
 * `pending` booking never held a seat — Phase 1's atomic accounting only
 * decrements on `accepted` — so there is nothing to release), no effect on
 * any other request for the same journey.
 */
export async function runBookingExpirySweep(db: Database): Promise<BookingExpirySweepResult> {
  const now = new Date();
  const candidates = await db.query.bookings.findMany({
    where: and(eq(bookings.status, 'pending'), isNotNull(bookings.expiresAt), lte(bookings.expiresAt, now)),
  });

  const result: BookingExpirySweepResult = { scanned: candidates.length, expired: 0 };

  for (const candidate of candidates) {
    const [updated] = await db
      .update(bookings)
      .set({ status: 'expired', respondedAt: now, updatedAt: now })
      .where(and(eq(bookings.id, candidate.id), eq(bookings.status, 'pending')))
      .returning();
    if (!updated) continue; // lost a race (e.g. accepted/declined/cancelled moments ago) — not an error.
    result.expired += 1;

    await notifyBestEffort(db, candidate.riderId, 'booking_declined', {
      bookingId: candidate.id,
      rideId: candidate.rideId,
      reason: 'request_expired',
    });
  }

  return result;
}

/**
 * `POST /bookings/:bookingId/report-no-show` (Phase 10 —
 * docs/roadmap/phase-10-cancellation-no-show.md; location corroboration
 * added in the journey-contract second pass — M-102, spec §37). Distinct
 * from `cancelBooking`: either party declares the *other* never showed up,
 * not that they themselves are withdrawing. Only ever valid from
 * `accepted` (mirrors the booking-status state machine's existing
 * `no_show` edge, packages/domain/src/booking/booking-status.ts —
 * unchanged by this phase).
 *
 * M-102: "No-show should be contextual... relevant around scheduled pickup
 * time, pickup location, driver/passenger physical proximity." Confirmed
 * live (this pass, before the fix) that `evaluateNoShowReport`
 * (packages/domain) existed but had no real caller anywhere — this
 * endpoint enforced only the time gate. `reporterLocation` is optional
 * (a passenger/driver's phone may have no fix at report time) — omitting
 * it degrades gracefully to the exact same time-only behavior this
 * endpoint already had, per `evaluateNoShowReport`'s own contract; it
 * never becomes a new way to fail a report that used to succeed.
 */
export async function reportNoShow(
  db: Database,
  bookingId: string,
  requestingUserId: string,
  reporterLocation: { lat: number; lng: number } | null = null,
) {
  const booking = await getBookingOrThrow(db, bookingId);
  const isRider = booking.riderId === requestingUserId;
  const isDriver = booking.ride.driverProfile.userId === requestingUserId;
  if (!isRider && !isDriver) {
    throw new ForbiddenError('Not authorized to report this booking');
  }

  if (!canTransitionBookingStatus(booking.status, 'no_show')) {
    throw new ConflictError(`Cannot report a no-show for a booking in status "${booking.status}"`);
  }

  const reportedAt = new Date();
  const opConfig = await getActiveOperationalConfig(db);
  const reporterDistanceMetersFromMeetingPoint = reporterLocation
    ? haversineDistanceMeters(reporterLocation, { lat: booking.pickupLat, lng: booking.pickupLng })
    : null;
  const noShowEvaluation = evaluateNoShowReport(
    booking.ride.departureAt,
    reportedAt,
    { reporterDistanceMetersFromMeetingPoint },
    opConfig.noShowMinMinutesAfterDeparture,
    opConfig.noShowMaxReporterDistanceMeters,
  );
  if (!noShowEvaluation.allowed) {
    const message =
      noShowEvaluation.reason === 'reporter_too_far'
        ? 'No-show cannot be reported from far away — you must be near the meeting point'
        : 'No-show can only be reported after the scheduled departure time';
    throw new ConflictError(message);
  }

  // the rider is reporting -> the driver is the no-show party
  return finalizeNoShowOutcome(db, booking, bookingId, reportedAt, isRider, requestingUserId, false);
}

/**
 * The shared, post-decision core of a no-show outcome — status transitions,
 * segment-aware seat release, conversation closure, the automatic penalty
 * rating, and notification — factored out of `reportNoShow` so M-104's
 * automatic classification path (trip-staleness sweep) reuses the exact same
 * real mechanism a human report goes through, rather than a second, parallel
 * implementation of "what happens when a no-show is recorded."
 *
 * `raterUserId` is the party the automatic rating/notification is attributed
 * to. For a human report that's the real reporter; for an automatic
 * classification (no human involved) it's the *other*, non-faulting party —
 * the genuinely aggrieved side of the encounter, exactly who would have filed
 * the report themselves had they gotten to it first. This needs no schema
 * change (`ratings.raterUserId` already only ever means "on whose account
 * this rating was recorded," not "who tapped the button").
 */
async function finalizeNoShowOutcome(
  db: Database,
  booking: Awaited<ReturnType<typeof getBookingOrThrow>>,
  bookingId: string,
  reportedAt: Date,
  reportedIsDriver: boolean,
  raterUserId: string,
  isAutomatic: boolean,
): Promise<typeof bookings.$inferSelect> {
  // Same atomic status-guard discipline as cancelBooking's fix above — only
  // the first writer to commit against this booking's current status can
  // win; a concurrent second report (human or automatic, or a race against a
  // concurrent cancelBooking on the same booking) gets a clean ConflictError
  // instead of both proceeding to double-release the seat below.
  //
  // Segment-aware seat release (matching-engine architecture plan §K) — same
  // recompute-from-scratch, ride-locked-first transaction shape as
  // cancelBooking above, replacing the old flat `LEAST(seatsAvailable + N,
  // seatsTotal)` restore. Only `accepted` bookings can reach `no_show` (the
  // transition guard above), so the seat was always actually held.
  const updatedBooking = await db.transaction(async (tx) => {
    const [lockedRide] = await tx.select().from(rides).where(eq(rides.id, booking.rideId)).for('update');
    if (!lockedRide) throw new NotFoundError('Ride');

    const [updated] = await tx
      .update(bookings)
      .set({ status: 'no_show', respondedAt: reportedAt, updatedAt: reportedAt })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, booking.status)))
      .returning();
    if (!updated) {
      throw new ConflictError(`Cannot report a no-show for a booking in status "${booking.status}"`);
    }

    // Recomputed AFTER the status transition above, so this already
    // excludes the just-reported booking from the accepted set.
    await recomputeAndPersistRideCapacity(tx, lockedRide);

    return updated;
  });

  const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });
  if (!trip) throw new NotFoundError('Trip');
  if (canTransitionTripStatus(trip.status, 'no_show')) {
    await db
      .update(trips)
      .set({
        status: 'no_show',
        updatedAt: new Date(),
        ...(isAutomatic ? { autoNoShowClassifiedAt: new Date() } : {}),
      })
      .where(eq(trips.id, trip.id));
  }

  await closeConversationBestEffort(db, booking.id);

  // The party being *reported* — never the reporter/rater — takes the
  // automatic low rating (packages/domain's NO_SHOW_AUTOMATIC_RATING_STARS)
  // and the heavier no-show penalty (NO_SHOW_PENALTY_POINTS), applied via
  // Phase 9's rating/reliability mechanism (ratings.service.ts), not a
  // second, parallel one.
  const driverUserId = booking.ride.driverProfile.userId;
  const reportedUserId = reportedIsDriver ? driverUserId : booking.riderId;
  const role: RatingRole = reportedIsDriver ? 'rider_rates_driver' : 'driver_rates_rider';

  await recordAutomaticNoShowRating(db, trip.id, raterUserId, reportedUserId, role);
  await applyCancellationPenalty(db, reportedUserId, reportedIsDriver, NO_SHOW_PENALTY_POINTS);

  await notifyBestEffort(db, reportedUserId, 'booking_no_show_reported', {
    bookingId: booking.id,
    rideId: booking.rideId,
    reportedBy: reportedIsDriver ? 'rider' : 'driver',
  });

  return updatedBooking;
}

/**
 * M-104 (spec §37): "VAYA may also automatically classify [a no-show] when
 * evidence is sufficiently strong." Called only from the trip-staleness
 * sweep, only once `evaluateAutoNoShowClassification` (packages/domain) has
 * already decided evidence is strong enough — this function's own job is
 * purely mechanical: resolve which real party is on which side of that
 * decision, then run the exact same outcome a human report would.
 */
export async function applyAutoNoShowClassification(
  db: Database,
  bookingId: string,
  reportedParty: 'driver' | 'rider',
): Promise<void> {
  const booking = await getBookingOrThrow(db, bookingId);
  if (!canTransitionBookingStatus(booking.status, 'no_show')) return;

  const reportedIsDriver = reportedParty === 'driver';
  const raterUserId = reportedIsDriver ? booking.riderId : booking.ride.driverProfile.userId;
  await finalizeNoShowOutcome(db, booking, bookingId, new Date(), reportedIsDriver, raterUserId, true);
}

/** Reveals the *other* party's phone number for an in-progress ride —
 *  never a public lookup (search/ride-details.tsx's own precedent: no
 *  phone number is ever exposed via the public profile API). Scoped to
 *  `accepted` bookings only: before acceptance there's no real commitment
 *  to coordinate around, and after cancellation/completion there's no
 *  ongoing ride to call about. Returns `phone: null` rather than throwing
 *  when the counterpart genuinely has none (Google-auth-only accounts
 *  never collect a phone number, `users.phone` is nullable) — an honest
 *  "no number on file" case, not an error. */
export async function getBookingContactPhone(
  db: Database,
  bookingId: string,
  requestingUserId: string,
) {
  const booking = await getBookingOrThrow(db, bookingId);
  const isRider = booking.riderId === requestingUserId;
  const isDriver = booking.ride.driverProfile.userId === requestingUserId;
  if (!isRider && !isDriver) {
    throw new ForbiddenError('Not authorized to view this booking');
  }
  if (booking.status !== 'accepted') {
    throw new ForbiddenError('Contact details are only available for an accepted booking');
  }

  const counterpartUserId = isRider ? booking.ride.driverProfile.userId : booking.riderId;
  const counterpart = await db.query.users.findFirst({ where: eq(users.id, counterpartUserId) });
  if (!counterpart) throw new NotFoundError('User');

  return { phone: counterpart.phone };
}
