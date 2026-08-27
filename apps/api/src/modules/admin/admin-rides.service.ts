import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { bookings, rides } from '../../db/schema/index.js';
import { canTransitionRideStatus } from '@vaya/domain';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import type { AdminRidesQuery } from '@vaya/validation';
import { notifyBestEffort } from '../notifications/notifications.service.js';
import { logAdminAction } from './audit-log.service.js';

type Database = ReturnType<typeof getDatabase>;
type RideStatus = (typeof rides.$inferSelect)['status'];

export async function listRidesForAdmin(db: Database, query: AdminRidesQuery) {
  const conditions = [];
  if (query.status) conditions.push(eq(rides.status, query.status as RideStatus));
  if (query.q) {
    conditions.push(or(ilike(rides.originLabel, `%${query.q}%`), ilike(rides.destinationLabel, `%${query.q}%`)));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db.query.rides.findMany({
      where,
      orderBy: desc(rides.departureAt),
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      with: { driverProfile: { with: { user: true } }, vehicle: true },
    }),
    db.select({ total: sql<number>`count(*)::int` }).from(rides).where(where),
  ]);

  return { items: rows, total: totalRows[0]?.total ?? 0, page: query.page, limit: query.limit };
}

export async function getRideDetailForAdmin(db: Database, rideId: string) {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, rideId),
    with: {
      driverProfile: { with: { user: true } },
      vehicle: true,
      stops: true,
      bookings: { with: { rider: true, trip: true } },
    },
  });
  if (!ride) throw new NotFoundError('Ride');
  return ride;
}

/**
 * Operational intervention (CLAUDE.md section 14): unlike the driver-facing
 * `cancelRide` (rides.service.ts), this also cancels every non-terminal
 * booking on the ride and notifies each affected rider — an admin
 * cancelling a ride is standing in for the driver's own cancellation from
 * every passenger's perspective, so leaving their bookings dangling
 * (the pre-existing behavior of the driver-facing path) would be a real
 * regression here, not a scope match.
 */
export async function adminCancelRide(
  db: Database,
  params: { rideId: string; reason: string; adminUserId: string },
) {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, params.rideId),
    with: { bookings: true },
  });
  if (!ride) throw new NotFoundError('Ride');
  if (!canTransitionRideStatus(ride.status, 'cancelled')) {
    throw new ConflictError(`Cannot cancel a ride in status "${ride.status}"`);
  }

  const [updated] = await db
    .update(rides)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(rides.id, params.rideId))
    .returning();
  if (!updated) throw new Error('Failed to cancel ride');

  const affectedBookings = ride.bookings.filter((b) => b.status === 'pending' || b.status === 'accepted');
  for (const booking of affectedBookings) {
    await db
      .update(bookings)
      .set({ status: 'cancelled_by_driver', respondedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, booking.id));
    await notifyBestEffort(db, booking.riderId, 'booking_cancelled', {
      bookingId: booking.id,
      reason: params.reason,
    });
  }

  await logAdminAction(db, {
    adminUserId: params.adminUserId,
    action: 'RIDE_CANCELLED',
    targetType: 'ride',
    targetId: params.rideId,
    reason: params.reason,
    previousState: { status: ride.status },
    newState: { status: updated.status, bookingsCancelled: affectedBookings.length },
  });

  return updated;
}
