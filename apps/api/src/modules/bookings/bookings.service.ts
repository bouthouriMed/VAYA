import { and, eq, inArray } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { bookings, rides, routeStops, riderProfiles, trips, users } from '../../db/schema/index.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import {
  canReportNoShow,
  canTransitionBookingStatus,
  canTransitionRideStatus,
  canTransitionTripStatus,
  classifyTripProfile,
  computeCancellationPolicy,
  computeMaxConcurrentSeats,
  detourAllowanceSec,
  getMatchingThresholds,
  wouldExceedCapacity,
  NO_SHOW_PENALTY_POINTS,
  type BookingSegment,
  type CancellationPolicyResult,
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
async function assertRealDetourWithinAllowance(
  ride: {
    originLat: number;
    originLng: number;
    destinationLat: number;
    destinationLng: number;
    routePolyline: string | null;
  },
  point: { lat: number; lng: number },
): Promise<void> {
  if (!ride.routePolyline) {
    throw new ValidationError('This ride has no route to validate a detour against');
  }
  const rideOrigin = { lat: ride.originLat, lng: ride.originLng };
  const rideDestination = { lat: ride.destinationLat, lng: ride.destinationLng };
  const [baseline, withDetour] = await Promise.all([
    getRoute(rideOrigin, rideDestination),
    getRoute(rideOrigin, rideDestination, [point]),
  ]);
  if (baseline.isEstimate || withDetour.isEstimate) {
    // No real routing engine reachable — never fabricate a detour number
    // from a haversine fallback, same discipline as the search tier.
    throw new ValidationError('Unable to validate this pickup or dropoff point right now — please try again');
  }
  const profile = classifyTripProfile(polylineLengthMeters(decodePolyline(ride.routePolyline)));
  const thresholds = getMatchingThresholds(profile.type);
  const extraDurationSeconds = Math.max(0, withDetour.durationSec - baseline.durationSec);
  const allowanceSec = detourAllowanceSec(baseline.durationSec, thresholds.detourFloorSec, thresholds.detourCeilingSec);
  if (extraDurationSeconds > allowanceSec) {
    throw new ValidationError("This point is too far from the driver's route for this ride");
  }
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
  if (trip && trip.status !== 'scheduled') {
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
      await assertRealDetourWithinAllowance(ride, { lat: pickupLat, lng: pickupLng });
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
  } else if (input.dropoff) {
    dropoffLabel = input.dropoff.label;
    dropoffLat = input.dropoff.lat;
    dropoffLng = input.dropoff.lng;
    await assertRealDetourWithinAllowance(ride, { lat: dropoffLat, lng: dropoffLng });
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

  const [booking] = await db
    .insert(bookings)
    .values({
      rideId,
      riderId,
      seatsRequested: input.seatsRequested,
      contributionTotal: ride.contributionPerSeat * input.seatsRequested,
      status: 'pending',
      pickupStopId,
      pickupLabel,
      pickupLat,
      pickupLng,
      dropoffStopId,
      dropoffLabel,
      dropoffLat,
      dropoffLng,
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
  const updated = await db.transaction(async (tx) => {
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

    return acceptedBooking;
  });

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

  return computeCancellationPolicy(booking.ride.departureAt, new Date());
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

export async function cancelBooking(db: Database, bookingId: string, requestingUserId: string) {
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
  const cancellationPolicy = computeCancellationPolicy(booking.ride.departureAt, cancelledAt);

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
      .set({ status: nextStatus, respondedAt: cancelledAt, updatedAt: cancelledAt })
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

/**
 * `POST /bookings/:bookingId/report-no-show` (Phase 10 —
 * docs/roadmap/phase-10-cancellation-no-show.md). Distinct from
 * `cancelBooking`: either party declares the *other* never showed up, not
 * that they themselves are withdrawing. Only ever valid from `accepted`
 * (mirrors the booking-status state machine's existing `no_show` edge,
 * packages/domain/src/booking/booking-status.ts — unchanged by this
 * phase), and only once `canReportNoShow` (packages/domain's business
 * rule) confirms enough real time has passed since `departureAt` —
 * enforced here, server-side, independent of the mobile UI's own guidance
 * text nudging a contact attempt first.
 */
export async function reportNoShow(db: Database, bookingId: string, requestingUserId: string) {
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
  if (!canReportNoShow(booking.ride.departureAt, reportedAt)) {
    throw new ConflictError('No-show can only be reported after the scheduled departure time');
  }

  // Same atomic status-guard discipline as cancelBooking's fix above — only
  // the first writer to commit against this booking's current status can
  // win; a concurrent second report (or a race against a concurrent
  // cancelBooking on the same booking) gets a clean ConflictError instead
  // of both proceeding to double-release the seat below.
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
    await db.update(trips).set({ status: 'no_show', updatedAt: new Date() }).where(eq(trips.id, trip.id));
  }

  await closeConversationBestEffort(db, booking.id);

  // The party being *reported* — never the reporter — takes the automatic
  // low rating (packages/domain's NO_SHOW_AUTOMATIC_RATING_STARS) and the
  // heavier no-show penalty (NO_SHOW_PENALTY_POINTS), applied via Phase 9's
  // rating/reliability mechanism (ratings.service.ts), not a second,
  // parallel one.
  const driverUserId = booking.ride.driverProfile.userId;
  const reportedIsDriver = isRider; // the rider is reporting -> the driver is the no-show party
  const reportedUserId = reportedIsDriver ? driverUserId : booking.riderId;
  const role: RatingRole = reportedIsDriver ? 'rider_rates_driver' : 'driver_rates_rider';

  await recordAutomaticNoShowRating(db, trip.id, requestingUserId, reportedUserId, role);
  await applyCancellationPenalty(db, reportedUserId, reportedIsDriver, NO_SHOW_PENALTY_POINTS);

  await notifyBestEffort(db, reportedUserId, 'booking_no_show_reported', {
    bookingId: booking.id,
    rideId: booking.rideId,
    reportedBy: isRider ? 'rider' : 'driver',
  });

  return updatedBooking;
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
