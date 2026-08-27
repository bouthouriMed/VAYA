import { desc, eq, sql } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { reports } from '../../db/schema/index.js';
import { NotFoundError } from '../../lib/errors.js';
import type { AdminReportsQuery, UpdateReportInput } from '@vaya/validation';
import { logAdminAction } from './audit-log.service.js';

type Database = ReturnType<typeof getDatabase>;
type ReportStatus = (typeof reports.$inferSelect)['status'];

export async function listReportsForAdmin(db: Database, query: AdminReportsQuery) {
  const where = query.status ? eq(reports.status, query.status as ReportStatus) : undefined;

  const [rows, totalRows] = await Promise.all([
    db.query.reports.findMany({
      where,
      orderBy: desc(reports.createdAt),
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      with: { reporter: true, reportedUser: true },
    }),
    db.select({ total: sql<number>`count(*)::int` }).from(reports).where(where),
  ]);

  return { items: rows, total: totalRows[0]?.total ?? 0, page: query.page, limit: query.limit };
}

export async function updateReportForAdmin(
  db: Database,
  params: { reportId: string; adminUserId: string; input: UpdateReportInput },
) {
  const report = await db.query.reports.findFirst({ where: eq(reports.id, params.reportId) });
  if (!report) throw new NotFoundError('Report');

  const isResolving = params.input.status === 'resolved' || params.input.status === 'dismissed';
  const [updated] = await db
    .update(reports)
    .set({
      status: params.input.status,
      resolutionNotes: params.input.resolutionNotes ?? report.resolutionNotes,
      ...(isResolving ? { resolvedByAdminId: params.adminUserId, resolvedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(reports.id, params.reportId))
    .returning();
  if (!updated) throw new Error('Failed to update report');

  await logAdminAction(db, {
    adminUserId: params.adminUserId,
    action: 'REPORT_STATUS_UPDATED',
    targetType: 'report',
    targetId: params.reportId,
    reason: params.input.resolutionNotes,
    previousState: { status: report.status },
    newState: { status: updated.status },
  });

  return updated;
}
