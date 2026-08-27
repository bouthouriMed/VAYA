import type { Job } from 'bullmq';
import type { getDatabase } from '../../lib/database.js';
import type { NotificationDispatchJobData } from '../../lib/queue.js';
import { dispatchPushForNotification, dispatchEmailForNotification } from './notifications.service.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * The single job processor for the notification-dispatch queue (lib/queue.ts).
 * Kept as a plain, directly-callable function — rather than only existing as
 * a `Worker`'s inline callback — so it's unit-testable without spinning up
 * a real BullMQ Worker/Redis connection, and so worker.ts (the standalone
 * process entry point) stays a thin wire-up.
 *
 * Runs push and email dispatch for the same notification row concurrently
 * (email dispatch added alongside push, same job/queue — no second job
 * type). Both run to completion via allSettled so one channel's failure
 * never skips the other; if either failed, the job still throws so BullMQ's
 * native retry picks it up, exactly as it already did for push alone. A
 * retried job re-sends push again too — an accepted, pre-existing tradeoff
 * (push was never made idempotent across retries), not a new one this
 * introduces.
 *
 * A single-channel failure rethrows that channel's own error unchanged
 * (preserving dispatchPushForNotification's pre-existing error-message
 * contract, which bookings-notifications.integration.test.ts asserts on
 * directly) rather than always wrapping in an AggregateError — the wrapper
 * is reserved for the genuinely new case, both channels failing at once.
 */
export async function processNotificationDispatchJob(
  db: Database,
  job: Job<NotificationDispatchJobData>,
): Promise<void> {
  const results = await Promise.allSettled([
    dispatchPushForNotification(db, job.data.notificationId),
    dispatchEmailForNotification(db, job.data.notificationId),
  ]);

  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failures.length === 1) {
    throw failures[0]!.reason;
  }
  if (failures.length > 1) {
    throw new AggregateError(
      failures.map((f) => f.reason),
      'Notification dispatch job failed',
    );
  }
}
