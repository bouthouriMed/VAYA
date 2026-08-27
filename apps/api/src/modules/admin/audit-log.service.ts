import { desc } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { auditLogs } from '../../db/schema/index.js';

type Database = ReturnType<typeof getDatabase>;

export interface LogAdminActionInput {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  previousState?: unknown;
  newState?: unknown;
}

/** Every mutating admin endpoint calls this — CLAUDE.md: "No important
 *  admin action should happen invisibly." Never best-effort/swallowed like
 *  notifyBestEffort: an audit-log write failing is itself something the
 *  caller should know about, not silently drop. */
export async function logAdminAction(db: Database, input: LogAdminActionInput): Promise<void> {
  await db.insert(auditLogs).values({
    adminUserId: input.adminUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason ?? null,
    previousState: input.previousState ?? null,
    newState: input.newState ?? null,
  });
}

export async function listAuditLogs(db: Database, targetType?: string, targetId?: string) {
  if (targetType && targetId) {
    return db.query.auditLogs.findMany({
      where: (log, { and, eq: eqOp }) => and(eqOp(log.targetType, targetType), eqOp(log.targetId, targetId)),
      orderBy: desc(auditLogs.createdAt),
      limit: 100,
      with: { adminUser: true },
    });
  }
  return db.query.auditLogs.findMany({
    orderBy: desc(auditLogs.createdAt),
    limit: 100,
    with: { adminUser: true },
  });
}
