import { eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { driverProfiles, vehicles, verificationDocuments } from '../../db/schema/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { canTransitionVerificationStatus } from '@vaya/domain';
import type {
  CreateDriverOnboardingInput,
  ResubmitVerificationInput,
  UpdateVehicleInput,
} from '@vaya/validation';
import { notifyBestEffort } from '../notifications/notifications.service.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * Admin verification workflow (docs/domain/verification-workflow.md):
 * submissions now enter a real review queue instead of the previous
 * synchronous auto-approve. This reverses a comment in this exact function
 * marked "locked product decision" — a deliberate, explicit product change
 * for this feature (not a casual override), since a real admin review queue
 * with pending/approve/decline states is this whole workflow's premise.
 * Every driver approved before this change keeps `verificationStatus:
 * 'approved'` untouched; only new submissions go through review.
 */
export async function createOnboarding(
  db: Database,
  userId: string,
  input: CreateDriverOnboardingInput,
) {
  const existing = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, userId),
  });
  if (existing) throw new ConflictError('Driver profile already exists for this user');

  const [profile] = await db
    .insert(driverProfiles)
    .values({
      userId,
      verificationStatus: 'pending',
      verificationSubmittedAt: new Date(),
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
      status: 'pending' as const,
    })),
  );

  await notifyBestEffort(db, userId, 'verification_submitted', {});

  return getMyDriverProfile(db, userId);
}

/**
 * A driver whose verification was marked `resubmission_required` re-submits
 * documents (and optionally an updated bio). Re-uses the same
 * driver_profiles/verification_documents rows rather than creating a new
 * onboarding attempt — preserves the rest of the driver's profile/vehicle
 * data so they don't have to redo unrelated work (CLAUDE.md section 11).
 * Old documents are replaced outright (not kept alongside new ones) since
 * only the latest submission is ever under review at once; the full
 * history of *decisions* still lives in audit_logs, not in document rows.
 */
export async function resubmitVerification(
  db: Database,
  userId: string,
  input: ResubmitVerificationInput,
) {
  const profile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, userId),
  });
  if (!profile) throw new NotFoundError('Driver profile');
  if (!canTransitionVerificationStatus(profile.verificationStatus, 'pending')) {
    throw new ForbiddenError(
      `Cannot resubmit verification from status "${profile.verificationStatus}"`,
    );
  }

  await db.delete(verificationDocuments).where(eq(verificationDocuments.driverProfileId, profile.id));
  await db.insert(verificationDocuments).values(
    input.documents.map((doc) => ({
      driverProfileId: profile.id,
      type: doc.type,
      fileUrl: doc.fileUrl,
      status: 'pending' as const,
    })),
  );

  const [updated] = await db
    .update(driverProfiles)
    .set({
      verificationStatus: 'pending',
      verificationSubmittedAt: new Date(),
      verificationAttempt: profile.verificationAttempt + 1,
      verificationDeclineReason: null,
      verificationDeclineMessage: null,
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      updatedAt: new Date(),
    })
    .where(eq(driverProfiles.id, profile.id))
    .returning();
  if (!updated) throw new Error('Failed to update driver profile');

  await notifyBestEffort(db, userId, 'verification_submitted', {});

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
