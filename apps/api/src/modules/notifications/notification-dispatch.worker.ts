import type { Job } from 'bullmq';
import type { getDatabase } from '../../lib/database.js';
import type { NotificationDispatchJobData } from '../../lib/queue.js';
import { dispatchPushForNotification } from './notifications.service.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * The single job processor for the notification-dispatch queue (lib/queue.ts).
 * Kept as a plain, directly-callable function — rather than only existing as
 * a `Worker`'s inline callback — so it's unit-testable without spinning up
 * a real BullMQ Worker/Redis connection, and so worker.ts (the standalone
 * process entry point) stays a thin wire-up.
 */
export async function processNotificationDispatchJob(
  db: Database,
  job: Job<NotificationDispatchJobData>,
): Promise<void> {
  await dispatchPushForNotification(db, job.data.notificationId);
}
