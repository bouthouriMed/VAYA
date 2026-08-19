import { eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { driverProfiles, vehicles, verificationDocuments } from '../../db/schema/index.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import type { CreateDriverOnboardingInput, UpdateVehicleInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

export async function createOnboarding(
  db: Database,
  userId: string,
  input: CreateDriverOnboardingInput,
) {
  const existing = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, userId),
  });
  if (existing) throw new ConflictError('Driver profile already exists for this user');

  // Auto-approve: no admin review UI in this product (locked product decision).
  const [profile] = await db
    .insert(driverProfiles)
    .values({
      userId,
      verificationStatus: 'approved',
      approvedAt: new Date(),
      bio: input.bio,
    })
    .returning();
  if (!profile) throw new Error('Failed to create driver profile');

  const [vehicle] = await db
    .insert(vehicles)
    .values({
      driverProfileId: profile.id,
      make: input.vehicle.make,
      model: input.vehicle.model,
      color: input.vehicle.color,
      plateNumber: input.vehicle.plateNumber,
      seatCount: input.vehicle.seatCount,
      photoUrl: input.vehicle.photoFileUrl,
    })
    .returning();
  if (!vehicle) throw new Error('Failed to create vehicle');

  await db.insert(verificationDocuments).values(
    input.documents.map((doc) => ({
      driverProfileId: profile.id,
      type: doc.type,
      fileUrl: doc.fileUrl,
      status: 'approved' as const,
    })),
  );

  return getMyDriverProfile(db, userId);
}

export async function getMyDriverProfile(db: Database, userId: string) {
  const profile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, userId),
    with: { vehicles: true, documents: true },
  });
  if (!profile) throw new NotFoundError('Driver profile');
  return profile;
}

export async function updateVehicle(db: Database, userId: string, input: UpdateVehicleInput) {
  const profile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, userId),
    with: { vehicles: true },
  });
  if (!profile) throw new NotFoundError('Driver profile');

  const vehicle = profile.vehicles[0];
  if (!vehicle) throw new NotFoundError('Vehicle');

  const [updated] = await db
    .update(vehicles)
    .set({
      ...(input.make !== undefined ? { make: input.make } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.plateNumber !== undefined ? { plateNumber: input.plateNumber } : {}),
      ...(input.seatCount !== undefined ? { seatCount: input.seatCount } : {}),
      ...(input.photoFileUrl !== undefined ? { photoUrl: input.photoFileUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(vehicles.id, vehicle.id))
    .returning();
  if (!updated) throw new Error('Failed to update vehicle');
  return updated;
}
