import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { bookings, rides, routeStops, riderProfiles, trips, users } from '../../db/schema/index.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import {
  canReportNoShow,
  canTransitionBookingStatus,
  canTransitionRideStatus,
  canTransitionTripStatus,
  computeCancellationPolicy,
  NO_SHOW_PENALTY_POINTS,
  type CancellationPolicyResult,
  type RatingRole,
} from '@vaya/domain';
import type { CreateBookingInput } from '@vaya/validation';
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

async function getRideOrThrow(db: Database, rideId: string) {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, rideId),
    with: { driverProfile: true },
  });
  if (!ride) throw new NotFoundError('Ride');
  return ride;
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
  if (ride.seatsAvailable < input.seatsRequested) {
    throw new AppError('Not enough seats available on this ride', 409, 'SEATS_UNAVAILABLE');
  }
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

  // A ride with at least one driver-selected route_stop must be booked via
  // pickupStopId — free-form coordinates are rejected outright for these
  // rides. This is the actual server-side enforcement of "never offer an
  // arbitrary/impossible pickup point" (CLAUDE.md product principle #1,
  // docs/domain/ride-engine.md), not just a UI nudge. Rides published
  // before Phase 4 (zero route_stops) keep the legacy free-form flow
  // working unchanged.
  const selectedStops = await db.query.routeStops.findMany({
    where: and(eq(routeStops.rideId, rideId), eq(routeStops.isDriverSelected, true)),
  });

  let pickupStopId: string | null = null;
  let pickupLabel: string;
  let pickupLat: number;
  let pickupLng: number;

  if (selectedStops.length > 0) {
    if (!input.pickupStopId) {
      throw new ValidationError('This ride requires selecting a pickup stop');
    }
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
  } else {
    if (input.pickupStopId) {
      throw new ValidationError('This ride has no selectable pickup stops');
    }
    if (!input.pickup) {
      throw new ValidationError('Pickup location is required');
    }
    pickupLabel = input.pickup.label;
    pickupLat = input.pickup.lat;
    pickupLng = input.pickup.lng;
  }

  // Dropoff-stop selection (Phase 13, docs/roadmap/phase-13-search-engine.md):
  // mirrors pickupStopId's validation, but always optional — a booking with
  // no dropoffStopId simply drops the rider at the ride's own destination,
  // exactly as every booking behaved before this field existed. Only
  // reachable when the ride actually has selected stops (a stop-less ride
  // has nothing to pick from), and must sit after the chosen pickup stop
  // on the route — a dropoff "before" your own pickup isn't a real trip.
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
    // selectedStops.length > 0 forces the pickupStopId branch above, so
    // pickupStopId is always set here — the find below always succeeds.
    const pickupStop = selectedStops.find((s) => s.id === pickupStopId)!;
    if (dropStop.sequence <= pickupStop.sequence) {
      throw new ValidationError('Dropoff stop must come after the pickup stop on this route');
    }
    dropoffStopId = dropStop.id;
    dropoffLabel = dropStop.label;
    dropoffLat = dropStop.lat;
    dropoffLng = dropStop.lng;
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

  // Atomic, database-level check-and-decrement: the WHERE clause is
  // evaluated against the row's current value at UPDATE time under
  // Postgres's row-level locking, not against the stale `booking.ride`
  // read above. Two concurrent accepts against the same ride can no
  // longer both pass a check based on the same stale seat count and
  // silently oversell — the loser here gets zero rows back instead.
  const [updatedRide] = await db
    .update(rides)
    .set({
      seatsAvailable: sql`${rides.seatsAvailable} - ${booking.seatsRequested}`,
      updatedAt: new Date(),
    })
    .where(and(eq(rides.id, booking.rideId), gte(rides.seatsAvailable, booking.seatsRequested)))
    .returning();
  if (!updatedRide) {
    throw new ConflictError('Not enough seats remaining to accept this request');
  }
  if (updatedRide.seatsAvailable === 0 && updatedRide.status === 'published') {
    await db
      .update(rides)
      .set({ status: 'full', updatedAt: new Date() })
      .where(eq(rides.id, booking.rideId));
  }

  const [updated] = await db
    .update(bookings)
    .set({ status: 'accepted', respondedAt: new Date(), updatedAt: new Date() })
    .where(eq(bookings.id, bookingId))
    .returning();
  if (!updated) throw new Error('Failed to accept booking');

  await db
    .insert(trips)
    .values({ bookingId: booking.id, rideId: booking.rideId, status: 'scheduled' });

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
 * when the driver published the ride (stop-candidates.service.ts). So for
 * the normal, current, stop-based booking flow this never needs a fresh
 * routing call at all — it just surfaces data that already exists. A live
 * getRoute detour computation only ever runs for the one case where it's
 * actually meaningful: a free-form pickup on a legacy (zero-route_stops)
 * ride, where the passenger's point genuinely could be anywhere.
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
    // A real free-form dropoff shouldn't normally occur under current
    // validation rules (dropoffStopId is required whenever the ride has
    // stops), but is handled honestly rather than assumed away.
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

  return {
    pickup,
    dropoff,
    segment: { distanceM: segment.distanceM, durationSec: segment.durationSec, isEstimate: segment.isEstimate },
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
  const [updated] = await db
    .update(bookings)
    .set({ status: nextStatus, respondedAt: cancelledAt, updatedAt: cancelledAt })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, booking.status)))
    .returning();
  if (!updated) {
    throw new ConflictError(`Cannot cancel a booking in status "${booking.status}"`);
  }

  if (booking.status === 'accepted') {
    const nextRideStatus = canTransitionRideStatus(booking.ride.status, 'published')
      ? 'published'
      : booking.ride.status;
    // Same atomic-update discipline as acceptBooking: restore against the
    // row's current value, capped at seatsTotal so a race between this and
    // another concurrent cancel/accept can't push seatsAvailable past the
    // vehicle's actual capacity.
    await db
      .update(rides)
      .set({
        seatsAvailable: sql`LEAST(${rides.seatsAvailable} + ${booking.seatsRequested}, ${rides.seatsTotal})`,
        status: nextRideStatus,
        updatedAt: new Date(),
      })
      .where(eq(rides.id, booking.rideId));

    await db
      .update(trips)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(trips.bookingId, booking.id));

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
  const [updatedBooking] = await db
    .update(bookings)
    .set({ status: 'no_show', respondedAt: reportedAt, updatedAt: reportedAt })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, booking.status)))
    .returning();
  if (!updatedBooking) {
    throw new ConflictError(`Cannot report a no-show for a booking in status "${booking.status}"`);
  }

  // Same atomic seat-release discipline as cancelBooking above — a
  // no-show still frees the seat back to the ride's pool. Only `accepted`
  // bookings can reach `no_show` (the transition guard above), so the seat
  // was always actually held.
  const nextRideStatus = canTransitionRideStatus(booking.ride.status, 'published')
    ? 'published'
    : booking.ride.status;
  await db
    .update(rides)
    .set({
      seatsAvailable: sql`LEAST(${rides.seatsAvailable} + ${booking.seatsRequested}, ${rides.seatsTotal})`,
      status: nextRideStatus,
      updatedAt: new Date(),
    })
    .where(eq(rides.id, booking.rideId));

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
