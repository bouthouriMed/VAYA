import { Worker } from 'bullmq';
import { validateEnv } from './config/env.js';
import { getLogger } from './config/logger.js';
import { getDatabase } from './lib/database.js';
import {
  getQueueConnection,
  NOTIFICATION_DISPATCH_QUEUE,
  type NotificationDispatchJobData,
} from './lib/queue.js';
import { processNotificationDispatchJob } from './modules/notifications/notification-dispatch.worker.js';

/**
 * Standalone process entry point for the notification-dispatch queue — the
 * "one queue, one worker process" pattern docs/roadmap/phase-07-notifications.md
 * scopes this to. Run alongside the API server (`pnpm --filter @vaya/api worker`
 * in dev, a separate deployed process/container in production) — it never
 * runs inside the Fastify request/response cycle, which is exactly what
 * keeps a push-send failure from ever being able to fail an API call.
 */
validateEnv();
const logger = getLogger();
const db = getDatabase();
const connection = getQueueConnection();

if (!connection) {
  logger.warn('REDIS_URL not configured — notification dispatch worker exiting without starting');
} else {
  const worker = new Worker<NotificationDispatchJobData>(
    NOTIFICATION_DISPATCH_QUEUE,
    (job) => processNotificationDispatchJob(db, job),
    { connection, concurrency: 5 },
  );

  worker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, notificationId: job.data.notificationId },
      'Notification dispatch job completed',
    );
  });

  worker.on('failed', (job, err) => {
    // Logged, never rethrown further — this process's entire purpose is to
    // isolate push-send failures from anything outside itself, including
    // the triggering API call, which returned long before this runs.
    logger.error(
      { jobId: job?.id, notificationId: job?.data.notificationId, err },
      'Notification dispatch job failed (will retry per BullMQ backoff, up to the configured attempt limit)',
    );
  });

  logger.info('Notification dispatch worker started');
}
