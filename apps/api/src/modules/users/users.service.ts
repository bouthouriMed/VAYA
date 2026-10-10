import { and, eq, inArray, ne } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import {
  users,
  driverProfiles,
  vehicles,
  bookings,
  rides,
  verificationDocuments,
  deviceTokens,
} from '../../db/schema/index.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { consumeValidOtp, revokeAllRefreshTokensForUser } from '../auth/auth.service.js';
import { getStorage } from '../../lib/storage/index.js';
import { resolvePublicFileReference } from '../../lib/storage/file-refs.js';
import type { UpdateMeInput } from '@vaya/validation';

// Ride statuses that still represent a live commitment to at least one
// Passenger — a driver may not delete their account while any of these are
// open (docs/legal/terms-and-conditions.md Article 16.3). 'draft' and
// 'completed'/'cancelled' are excluded: a draft has no Passenger commitment
// yet, and completed/cancelled are terminal.
const ACTIVE_RIDE_STATUSES = ['published', 'full', 'in_progress'] as const;
// Booking statuses that still represent a live commitment to a Driver.
const ACTIVE_BOOKING_STATUSES = ['pending', 'accepted'] as const;

const DELETED_ACCOUNT_NAME = 'Utilisateur supprimé';

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
  // Never persist a client-supplied URL as-is (VAYA-SEC-009): only a
  // well-formed reference to a file this API's own upload endpoints minted,
  // rebuilt from its object name.
  if (input.avatarFileUrl !== undefined) {
    updates.avatarUrl = resolvePublicFileReference(input.avatarFileUrl, (name) =>
      getStorage().toPublicUrl(name),
    );
  }

  const [updated] = await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw new NotFoundError('User');
  return updated;
}

/**
 * Attaches a verified phone number to an already-authenticated user (e.g. a
 * Google sign-in account that has no phone yet) — distinct from
 * verifyOtpAndIssueTokens, which signs a *new* session in for whichever user
 * owns the phone. Here the caller is already signed in; a valid code only
 * ever updates *their* row, never switches identity or creates a second user.
 */
export async function attachPhoneToUser(
  db: Database,
  userId: string,
  phone: string,
  code: string,
) {
  await consumeValidOtp(db, phone, code);

  const existingWithPhone = await db.query.users.findFirst({ where: eq(users.phone, phone) });
  if (existingWithPhone && existingWithPhone.id !== userId) {
    throw new ConflictError('Ce numéro est déjà associé à un autre compte VAYA.');
  }

  const [updated] = await db
    .update(users)
    .set({ phone, updatedAt: new Date() })
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
          bio: driverProfile.bio,
          languages: driverProfile.languages
            ? driverProfile.languages.split(',').map((l) => l.trim())
            : null,
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
                plateNumber: vehicle.plateNumber,
              }
            : null,
        }
      : null,
  };
}

/** True if any *other* user's avatar, or any vehicle photo, references the
 *  same public file. */
async function isPublicFileReferencedElsewhere(
  db: Database,
  fileUrl: string,
  excludingUserId: string,
): Promise<boolean> {
  const otherAvatar = await db.query.users.findFirst({
    where: and(eq(users.avatarUrl, fileUrl), ne(users.id, excludingUserId)),
  });
  if (otherAvatar) return true;
  const vehicleUsingIt = await db.query.vehicles.findFirst({ where: eq(vehicles.photoUrl, fileUrl) });
  return Boolean(vehicleUsingIt);
}

/**
 * Account deletion (docs/legal/privacy-policy.md §10, docs/legal/
 * terms-and-conditions.md Article 16). A real hard `DELETE FROM users` is
 * unsafe for any user with real marketplace activity — `bookings.riderId`,
 * `ratings.raterUserId`/`rateeUserId`, and `messages.senderUserId` have no
 * `onDelete` clause (Postgres would reject it with a FK violation), and
 * cascading through `driver_profiles` would delete every ride a driver ever
 * published, taking every *other* rider's booking on those rides down with
 * it. This is a soft-delete + PII anonymization instead, mirroring the
 * existing `suspendedAt`/`suspendedReason` pattern: irreversible, but never
 * removes a row another Member's own history still legitimately points at.
 *
 * Blocked outright while the user has a live commitment to another Member —
 * an active Booking as a rider, or a still-open Ride as a driver — so a
 * deletion can never leave a counterpart mid-commitment with a vanished
 * partner.
 */
export async function deleteUser(db: Database, userId: string, reason?: string) {
  const user = await getUserById(db, userId);
  if (user.deletedAt) return user;

  const activeBooking = await db.query.bookings.findFirst({
    where: and(eq(bookings.riderId, userId), inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES])),
  });
  if (activeBooking) {
    throw new ConflictError(
      'Vous avez une réservation active. Annulez-la avant de supprimer votre compte.',
    );
  }

  const driverProfile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, userId),
  });
  if (driverProfile) {
    const activeRide = await db.query.rides.findFirst({
      where: and(
        eq(rides.driverProfileId, driverProfile.id),
        inArray(rides.status, [...ACTIVE_RIDE_STATUSES]),
      ),
    });
    if (activeRide) {
      throw new ConflictError(
        'Vous avez un trajet publié en cours. Annulez-le avant de supprimer votre compte.',
      );
    }
  }

  // Real erasure, not just a DB flag: the Privacy Policy promises KYC
  // documents and the profile photo are actually removed from file
  // storage, not merely orphaned. Best-effort per-file (storage adapters'
  // remove/removeSecure already swallow "already gone" errors) — a
  // partial storage failure must never block the deletion itself, since
  // the DB anonymization below is the part a data-subject-rights request
  // is actually measured against.
  const storage = getStorage();
  if (driverProfile) {
    const documents = await db.query.verificationDocuments.findMany({
      where: eq(verificationDocuments.driverProfileId, driverProfile.id),
    });
    await Promise.all(documents.map((doc) => storage.removeSecure(doc.fileUrl)));
  }
  // Only erase the avatar file if no other account/vehicle still points at
  // it: these columns are client-set references, so without this check one
  // user pointing their avatar at another's public photo and then deleting
  // their own account would destroy the other person's file.
  if (user.avatarUrl && !(await isPublicFileReferencedElsewhere(db, user.avatarUrl, userId))) {
    await storage.remove(user.avatarUrl);
  }

  await revokeAllRefreshTokensForUser(db, userId);
  // A deleted account must stop receiving pushes on every device.
  await db.delete(deviceTokens).where(eq(deviceTokens.userId, userId));

  const [updated] = await db
    .update(users)
    .set({
      phone: null,
      email: null,
      googleId: null,
      fullName: DELETED_ACCOUNT_NAME,
      avatarUrl: null,
      deletedAt: new Date(),
      deletionReason: reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw new NotFoundError('User');
  return updated;
}
