import { Worker, type Job } from 'bullmq';
import { validateEnv } from './config/env.js';
import { getLogger } from './config/logger.js';
import { getDatabase } from './lib/database.js';
import {
  getQueueConnection,
  NOTIFICATION_DISPATCH_QUEUE,
  RECURRING_PATTERN_SCAN_JOB_NAME,
  scheduleRecurringPatternScanJob,
  TRIP_STALENESS_SWEEP_JOB_NAME,
  scheduleTripStalenessSweepJob,
  type NotificationDispatchJobData,
  type QueueJobData,
  type RecurringPatternScanJobData,
  type TripStalenessSweepJobData,
} from './lib/queue.js';
import { processNotificationDispatchJob } from './modules/notifications/notification-dispatch.worker.js';
import { processRecurringPatternScanJob } from './modules/recurring/recurring-pattern-scan.worker.js';
import { processTripStalenessSweepJob } from './modules/trips/trip-staleness-sweep.worker.js';

/**
 * Standalone process entry point for the notification-dispatch queue — the
 * "one queue, one worker process" pattern docs/roadmap/phase-07-notifications.md
 * scopes this to. Run alongside the API server (`pnpm --filter @vaya/api worker`
 * in dev, a separate deployed process/container in production) — it never
 * runs inside the Fastify request/response cycle, which is exactly what
 * keeps a push-send failure from ever being able to fail an API call.
 *
 * Phase 11 (docs/roadmap/phase-11-recurring-rides.md) adds a second job
 * type to this same queue/worker/process — the periodic recurring-pattern
 * detection scan — routed by `job.name` below, not a second Worker/queue.
 */
validateEnv();
const logger = getLogger();
const db = getDatabase();
const connection = getQueueConnection();

if (!connection) {
  logger.warn('REDIS_URL not configured — background worker exiting without starting');
} else {
  const worker = new Worker<QueueJobData>(
    NOTIFICATION_DISPATCH_QUEUE,
    async (job) => {
      if (job.name === RECURRING_PATTERN_SCAN_JOB_NAME) {
        return processRecurringPatternScanJob(db, job as Job<RecurringPatternScanJobData>);
      }
      if (job.name === TRIP_STALENESS_SWEEP_JOB_NAME) {
        return processTripStalenessSweepJob(db, job as Job<TripStalenessSweepJobData>);
      }
      return processNotificationDispatchJob(db, job as Job<NotificationDispatchJobData>);
    },
    { connection, concurrency: 5 },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Background job completed');
  });

  worker.on('failed', (job, err) => {
    // Logged, never rethrown further — this process's entire purpose is to
    // isolate job failures (push-send, detection-scan) from anything
    // outside itself, including whatever triggered the job.
    logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Background job failed (will retry per BullMQ backoff, up to the configured attempt limit)');
  });

  logger.info('Background worker started (notification dispatch + recurring-pattern scan + trip-staleness sweep)');

  // Idempotent (stable jobId) — safe to call on every worker process start.
  void scheduleRecurringPatternScanJob();
  void scheduleTripStalenessSweepJob();
}
