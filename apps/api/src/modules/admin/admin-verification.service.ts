import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { driverProfiles, verificationDocuments } from '../../db/schema/index.js';
import { canTransitionVerificationStatus, type VerificationStatus } from '@vaya/domain';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import type {
  ApproveVerificationInput,
  DeclineVerificationInput,
  VerificationQueueQuery,
} from '@vaya/validation';
import { notifyBestEffort } from '../notifications/notifications.service.js';
import { logAdminAction, listAuditLogs } from './audit-log.service.js';
import { getStorage } from '../../lib/storage/index.js';

type Database = ReturnType<typeof getDatabase>;

const REVIEWABLE_STATUSES: VerificationStatus[] = ['pending', 'under_review'];

export async function listVerificationQueue(db: Database, query: VerificationQueueQuery) {
  const statuses = query.status
    ? [query.status as VerificationStatus]
    : REVIEWABLE_STATUSES;

  const [rows, totalRows] = await Promise.all([
    db.query.driverProfiles.findMany({
      where: inArray(driverProfiles.verificationStatus, statuses),
      orderBy: desc(driverProfiles.verificationSubmittedAt),
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      with: { user: true, documents: true, vehicles: true },
    }),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(driverProfiles)
      .where(inArray(driverProfiles.verificationStatus, statuses)),
  ]);
  const total = totalRows[0]?.total ?? 0;

  const counts = await db
    .select({ status: driverProfiles.verificationStatus, count: sql<number>`count(*)::int` })
    .from(driverProfiles)
    .groupBy(driverProfiles.verificationStatus);

  return {
    items: rows,
    total,
    page: query.page,
    limit: query.limit,
    countsByStatus: Object.fromEntries(counts.map((c) => [c.status, c.count])),
  };
}

export async function getVerificationDetail(db: Database, driverProfileId: string) {
  const profile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.id, driverProfileId),
    with: { user: true, documents: true, vehicles: true },
  });
  if (!profile) throw new NotFoundError('Driver profile');

  const history = await listAuditLogs(db, 'driver_profile', driverProfileId);
  return { profile, history };
}

/** Streams one submitted document's actual bytes for the admin review
 *  screen — never the raw `fileUrl` a client could bookmark or share,
 *  since that would defeat the point of `saveSecure` (docs/domain/
 *  verification-workflow.md's "Document security" section). Only reachable
 *  behind `authenticateAdmin` (admin.routes.ts). */
export async function getVerificationDocumentFile(
  db: Database,
  documentId: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const doc = await db.query.verificationDocuments.findFirst({
    where: eq(verificationDocuments.id, documentId),
  });
  if (!doc) throw new NotFoundError('Document');

  const file = await getStorage().readSecure(doc.fileUrl);
  if (!file) throw new NotFoundError('Document file');
  return file;
}

async function markUnderReview(db: Database, profile: { id: string; verificationStatus: VerificationStatus }) {
  if (profile.verificationStatus === 'pending') {
    await db
      .update(driverProfiles)
      .set({ verificationStatus: 'under_review', updatedAt: new Date() })
      .where(eq(driverProfiles.id, profile.id));
  }
}

export async function approveVerification(
  db: Database,
  params: { driverProfileId: string; adminUserId: string; input: ApproveVerificationInput },
) {
  const profile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.id, params.driverProfileId),
  });
  if (!profile) throw new NotFoundError('Driver profile');

  await markUnderReview(db, profile);
  const fromStatus: VerificationStatus =
    profile.verificationStatus === 'pending' ? 'under_review' : profile.verificationStatus;
  if (!canTransitionVerificationStatus(fromStatus, 'approved')) {
    throw new ConflictError(`Cannot approve verification from status "${profile.verificationStatus}"`);
  }

  const now = new Date();
  const [updated] = await db
    .update(driverProfiles)
    .set({
      verificationStatus: 'approved',
      approvedAt: now,
      verificationReviewedByAdminId: params.adminUserId,
      verificationReviewedAt: now,
      verificationDeclineReason: null,
      verificationDeclineMessage: null,
      verificationAdminNotes: params.input.notes ?? profile.verificationAdminNotes,
      updatedAt: now,
    })
    .where(eq(driverProfiles.id, params.driverProfileId))
    .returning();
  if (!updated) throw new Error('Failed to approve verification');

  await notifyBestEffort(db, profile.userId, 'verification_approved', {});
  await logAdminAction(db, {
    adminUserId: params.adminUserId,
    action: 'VERIFICATION_APPROVED',
    targetType: 'driver_profile',
    targetId: params.driverProfileId,
    reason: params.input.notes,
    previousState: { verificationStatus: profile.verificationStatus },
    newState: { verificationStatus: 'approved' },
  });

  return updated;
}

export async function declineVerification(
  db: Database,
  params: { driverProfileId: string; adminUserId: string; input: DeclineVerificationInput },
) {
  const profile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.id, params.driverProfileId),
  });
  if (!profile) throw new NotFoundError('Driver profile');

  await markUnderReview(db, profile);
  const fromStatus: VerificationStatus =
    profile.verificationStatus === 'pending' ? 'under_review' : profile.verificationStatus;
  if (!canTransitionVerificationStatus(fromStatus, params.input.outcome)) {
    throw new ConflictError(
      `Cannot decline verification from status "${profile.verificationStatus}"`,
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(driverProfiles)
    .set({
      verificationStatus: params.input.outcome,
      verificationReviewedByAdminId: params.adminUserId,
      verificationReviewedAt: now,
      verificationDeclineReason: params.input.reason,
      verificationDeclineMessage: params.input.message,
      verificationAdminNotes: params.input.notes ?? profile.verificationAdminNotes,
      updatedAt: now,
    })
    .where(eq(driverProfiles.id, params.driverProfileId))
    .returning();
  if (!updated) throw new Error('Failed to decline verification');

  await notifyBestEffort(
    db,
    profile.userId,
    params.input.outcome === 'resubmission_required' ? 'verification_resubmission_required' : 'verification_declined',
    { declineMessage: params.input.message },
  );
  await logAdminAction(db, {
    adminUserId: params.adminUserId,
    action:
      params.input.outcome === 'resubmission_required'
        ? 'VERIFICATION_RESUBMISSION_REQUESTED'
        : 'VERIFICATION_DECLINED',
    targetType: 'driver_profile',
    targetId: params.driverProfileId,
    reason: `${params.input.reason}: ${params.input.message}`,
    previousState: { verificationStatus: profile.verificationStatus },
    newState: { verificationStatus: updated.verificationStatus },
  });

  return updated;
}
