import { eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { users, driverProfiles, vehicles } from '../../db/schema/index.js';
import { NotFoundError } from '../../lib/errors.js';
import type { UpdateMeInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

export async function getUserById(db: Database, userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundError('User');
  return user;
}

export async function updateUser(db: Database, userId: string, input: UpdateMeInput) {
  const updates: Partial<typeof users.$inferInsert> = {};
  if (input.fullName !== undefined) updates.fullName = input.fullName;
  if (input.locale !== undefined) updates.locale = input.locale;
  if (input.avatarFileUrl !== undefined) updates.avatarUrl = input.avatarFileUrl;

  const [updated] = await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw new NotFoundError('User');
  return updated;
}

/** Public trust-card subset: identity + driver reputation, if any. Never exposes phone/contacts. */
export async function getPublicProfile(db: Database, userId: string) {
  const user = await getUserById(db, userId);
  const driverProfile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, userId),
  });

  let vehicle = null;
  if (driverProfile) {
    vehicle = await db.query.vehicles.findFirst({
      where: eq(vehicles.driverProfileId, driverProfile.id),
    });
  }

  return {
    id: user.id,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    driver: driverProfile
      ? {
          ratingAvg: driverProfile.ratingAvg,
          tripCount: driverProfile.tripCount,
          punctualityScore: driverProfile.punctualityScore,
          reliabilityScore: driverProfile.reliabilityScore,
          vehicle: vehicle
            ? {
                make: vehicle.make,
                model: vehicle.model,
                color: vehicle.color,
                photoUrl: vehicle.photoUrl,
              }
            : null,
        }
      : null,
  };
}
