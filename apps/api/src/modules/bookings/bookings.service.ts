import { and, eq, gte, sql } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { bookings, rides, routeStops, trips } from '../../db/schema/index.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { canTransitionBookingStatus, canTransitionRideStatus } from '@vaya/domain';
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

type Database = ReturnType<typeof getDatabase>;

async function getRideOrThrow(db: Database, rideId: string) {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, rideId),
    with: { driverProfile: true },
  });
  if (!ride) throw new NotFoundError('Ride');
  return ride;
}

async function getBookingOrThrow(db: Database, bookingId: string) {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: { ride: { with: { driverProfile: true } } },
  });
  if (!booking) throw new NotFoundError('Booking');
  return booking;
}

export async function createBooking(
  db: Database,
  rideId: string,
  riderId: string,
  input: CreateBookingInput,
) {
  const ride = await getRideOrThrow(db, rideId);

  if (ride.status !== 'published') {
    throw new ConflictError('This ride is no longer accepting requests');
  }
  if (ride.seatsAvailable < input.seatsRequested) {
    throw new ConflictError('Not enough seats available on this ride');
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
    })
    .returning();
  if (!booking) throw new Error('Failed to create booking');

  await notifyBestEffort(db, ride.driverProfile.userId, 'booking_requested', {
    bookingId: booking.id,
    rideId,
    riderId,
    seatsRequested: booking.seatsRequested,
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
    },
  }));
}

export async function listRequestsForRide(db: Database, rideId: string, requestingUserId: string) {
  const ride = await getRideOrThrow(db, rideId);
  if (ride.driverProfile.userId !== requestingUserId) {
    throw new ForbiddenError('Only the driver can view requests for this ride');
  }
  return db.query.bookings.findMany({ where: eq(bookings.rideId, rideId), with: { rider: true } });
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
  });

  return updated;
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

  const [updated] = await db
    .update(bookings)
    .set({ status: nextStatus, respondedAt: new Date(), updatedAt: new Date() })
    .where(eq(bookings.id, bookingId))
    .returning();
  if (!updated) throw new Error('Failed to cancel booking');

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

  return updated;
}
