import { eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { bookings, rides, trips } from '../../db/schema/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { canTransitionBookingStatus, canTransitionRideStatus } from '@vaya/domain';
import type { CreateBookingInput } from '@vaya/validation';

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

  const [booking] = await db
    .insert(bookings)
    .values({
      rideId,
      riderId,
      seatsRequested: input.seatsRequested,
      contributionTotal: ride.contributionPerSeat * input.seatsRequested,
      status: 'pending',
      pickupLabel: input.pickup.label,
      pickupLat: input.pickup.lat,
      pickupLng: input.pickup.lng,
    })
    .returning();
  if (!booking) throw new Error('Failed to create booking');
  return booking;
}

export async function listMyBookings(db: Database, riderId: string) {
  return db.query.bookings.findMany({
    where: eq(bookings.riderId, riderId),
    with: { ride: true },
  });
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
  if (booking.ride.seatsAvailable < booking.seatsRequested) {
    throw new ConflictError('Not enough seats remaining to accept this request');
  }

  const [updated] = await db
    .update(bookings)
    .set({ status: 'accepted', respondedAt: new Date(), updatedAt: new Date() })
    .where(eq(bookings.id, bookingId))
    .returning();
  if (!updated) throw new Error('Failed to accept booking');

  const remainingSeats = booking.ride.seatsAvailable - booking.seatsRequested;
  const nextRideStatus = remainingSeats === 0 ? 'full' : booking.ride.status;
  await db
    .update(rides)
    .set({ seatsAvailable: remainingSeats, status: nextRideStatus, updatedAt: new Date() })
    .where(eq(rides.id, booking.rideId));

  await db
    .insert(trips)
    .values({ bookingId: booking.id, rideId: booking.rideId, status: 'scheduled' });

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
    const restoredSeats = booking.ride.seatsAvailable + booking.seatsRequested;
    const nextRideStatus = canTransitionRideStatus(booking.ride.status, 'published')
      ? 'published'
      : booking.ride.status;
    await db
      .update(rides)
      .set({ seatsAvailable: restoredSeats, status: nextRideStatus, updatedAt: new Date() })
      .where(eq(rides.id, booking.rideId));

    await db
      .update(trips)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(trips.bookingId, booking.id));
  }

  return updated;
}
