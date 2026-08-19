import type { Job } from 'bullmq';
import type { getDatabase } from '../../lib/database.js';
import type { RecurringPatternScanJobData } from '../../lib/queue.js';
import { runRecurringPatternDetectionScan } from './recurring.service.js';
import { getLogger } from '../../config/logger.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * The job processor for the `recurring-pattern-scan` job (lib/queue.ts) —
 * mirrors notifications/notification-dispatch.worker.ts's "plain,
 * directly-callable function" shape, kept separate from the `Worker`'s
 * inline callback so it's unit-testable without a real BullMQ
 * Worker/Redis connection, and so worker.ts stays a thin wire-up that just
 * routes by job name.
 */
export async function processRecurringPatternScanJob(
  db: Database,
  _job: Job<RecurringPatternScanJobData>,
): Promise<void> {
  const result = await runRecurringPatternDetectionScan(db);
  getLogger().info({ result }, 'Recurring-pattern scan completed');
}
