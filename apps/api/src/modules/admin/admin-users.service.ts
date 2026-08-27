import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { bookings, driverProfiles, rides, users } from '../../db/schema/index.js';
import { NotFoundError } from '../../lib/errors.js';
import type { AdminUsersQuery } from '@vaya/validation';
import { logAdminAction } from './audit-log.service.js';

type Database = ReturnType<typeof getDatabase>;

export async function listUsersForAdmin(db: Database, query: AdminUsersQuery) {
  const where = query.q
    ? or(
        ilike(users.fullName, `%${query.q}%`),
        ilike(users.phone, `%${query.q}%`),
        ilike(users.email, `%${query.q}%`),
      )
    : undefined;

  const [rows, totalRows] = await Promise.all([
    db.query.users.findMany({
      where,
      orderBy: desc(users.createdAt),
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      with: { driverProfile: true, riderProfile: true },
    }),
    db.select({ total: sql<number>`count(*)::int` }).from(users).where(where),
  ]);

  return { items: rows, total: totalRows[0]?.total ?? 0, page: query.page, limit: query.limit };
}

export async function getUserDetailForAdmin(db: Database, userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: { driverProfile: { with: { vehicles: true, documents: true } }, riderProfile: true },
  });
  if (!user) throw new NotFoundError('User');

  const [ridesAsDriver, bookingsAsRider] = await Promise.all([
    user.driverProfile
      ? db.query.rides.findMany({
          where: eq(rides.driverProfileId, user.driverProfile.id),
          orderBy: desc(rides.createdAt),
          limit: 20,
        })
      : Promise.resolve([]),
    db.query.bookings.findMany({
      where: eq(bookings.riderId, userId),
      orderBy: desc(bookings.createdAt),
      limit: 20,
      with: { ride: true },
    }),
  ]);

  return { user, ridesAsDriver, bookingsAsRider };
}

export async function suspendUser(
  db: Database,
  params: { userId: string; reason: string; adminUserId: string },
) {
  const user = await db.query.users.findFirst({ where: eq(users.id, params.userId) });
  if (!user) throw new NotFoundError('User');

  const [updated] = await db
    .update(users)
    .set({ suspendedAt: new Date(), suspendedReason: params.reason, updatedAt: new Date() })
    .where(eq(users.id, params.userId))
    .returning();
  if (!updated) throw new Error('Failed to suspend user');

  await logAdminAction(db, {
    adminUserId: params.adminUserId,
    action: 'USER_SUSPENDED',
    targetType: 'user',
    targetId: params.userId,
    reason: params.reason,
    previousState: { suspendedAt: user.suspendedAt },
    newState: { suspendedAt: updated.suspendedAt },
  });

  return updated;
}

export async function reactivateUser(
  db: Database,
  params: { userId: string; adminUserId: string },
) {
  const user = await db.query.users.findFirst({ where: eq(users.id, params.userId) });
  if (!user) throw new NotFoundError('User');

  const [updated] = await db
    .update(users)
    .set({ suspendedAt: null, suspendedReason: null, updatedAt: new Date() })
    .where(eq(users.id, params.userId))
    .returning();
  if (!updated) throw new Error('Failed to reactivate user');

  await logAdminAction(db, {
    adminUserId: params.adminUserId,
    action: 'USER_REACTIVATED',
    targetType: 'user',
    targetId: params.userId,
    previousState: { suspendedAt: user.suspendedAt },
    newState: { suspendedAt: null },
  });

  return updated;
}

export async function setDriverPrivilegeRestriction(
  db: Database,
  params: { userId: string; restrict: boolean; reason?: string; adminUserId: string },
) {
  const profile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, params.userId),
  });
  if (!profile) throw new NotFoundError('Driver profile');

  const [updated] = await db
    .update(driverProfiles)
    .set({
      suspendedAt: params.restrict ? new Date() : null,
      suspendedReason: params.restrict ? (params.reason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(driverProfiles.id, profile.id))
    .returning();
  if (!updated) throw new Error('Failed to update driver privilege restriction');

  await logAdminAction(db, {
    adminUserId: params.adminUserId,
    action: params.restrict ? 'DRIVER_RESTRICTED' : 'DRIVER_UNRESTRICTED',
    targetType: 'driver_profile',
    targetId: profile.id,
    reason: params.reason,
    previousState: { suspendedAt: profile.suspendedAt },
    newState: { suspendedAt: updated.suspendedAt },
  });

  return updated;
}
