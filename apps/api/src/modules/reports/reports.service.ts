import type { getDatabase } from '../../lib/database.js';
import { reports } from '../../db/schema/index.js';
import type { CreateReportInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

/** Safety/moderation reports (CLAUDE.md section 6/14 "Reports / Safety") —
 *  the mobile-facing half; apps/api/src/modules/admin/admin-reports.service.ts
 *  is the admin-facing review half of the same table. Deliberately no
 *  authorization checks on reportedUserId/bookingId/tripId beyond "must be
 *  a real authenticated user reporting" — a report about a booking the
 *  reporter wasn't even part of is still information an admin should see,
 *  not something to reject at submission time. */
export async function createReport(db: Database, reporterUserId: string, input: CreateReportInput) {
  const [report] = await db
    .insert(reports)
    .values({
      reporterUserId,
      reportedUserId: input.reportedUserId ?? null,
      bookingId: input.bookingId ?? null,
      tripId: input.tripId ?? null,
      category: input.category,
      description: input.description,
    })
    .returning();
  if (!report) throw new Error('Failed to create report');
  return report;
}
