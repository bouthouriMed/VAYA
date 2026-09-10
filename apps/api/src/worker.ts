import { Worker, type Job } from 'bullmq';
import { validateEnv } from './config/env.js';
import { getLogger } from './config/logger.js';
import { initMonitoring, captureException } from './config/monitoring.js';
import { getDatabase, closeDatabase } from './lib/database.js';
import {
  getQueueConnection,
  closeQueue,
  NOTIFICATION_DISPATCH_QUEUE,
  RECURRING_PATTERN_SCAN_JOB_NAME,
  scheduleRecurringPatternScanJob,
  TRIP_STALENESS_SWEEP_JOB_NAME,
  scheduleTripStalenessSweepJob,
  BOOKING_EXPIRY_SWEEP_JOB_NAME,
  scheduleBookingExpirySweepJob,
  type BookingExpirySweepJobData,
  type NotificationDispatchJobData,
  type QueueJobData,
  type RecurringPatternScanJobData,
  type TripStalenessSweepJobData,
} from './lib/queue.js';
import { processNotificationDispatchJob } from './modules/notifications/notification-dispatch.worker.js';
import { processRecurringPatternScanJob } from './modules/recurring/recurring-pattern-scan.worker.js';
import { processTripStalenessSweepJob } from './modules/trips/trip-staleness-sweep.worker.js';
import { processBookingExpirySweepJob } from './modules/bookings/booking-expiry-sweep.worker.js';

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
initMonitoring();
const logger = getLogger();
const db = getDatabase();
const connection = getQueueConnection();

// Mirrors server.ts's handlers — BullMQ wraps each job handler in its own
// try/catch, but an error escaping that (e.g. a fire-and-forget promise
// inside a job) previously crashed this process with no structured log.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Worker: uncaught exception — exiting');
  captureException(err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Worker: unhandled promise rejection — exiting');
  captureException(reason);
  process.exit(1);
});

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
      if (job.name === BOOKING_EXPIRY_SWEEP_JOB_NAME) {
        return processBookingExpirySweepJob(db, job as Job<BookingExpirySweepJobData>);
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
    // Only report once retries are exhausted — an individual attempt
    // failing mid-backoff is expected/routine, not yet an incident.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      captureException(err);
    }
  });

  logger.info('Background worker started (notification dispatch + recurring-pattern scan + trip-staleness sweep + booking-expiry sweep)');

  // Idempotent (stable jobId) — safe to call on every worker process start.
  void scheduleRecurringPatternScanJob();
  void scheduleTripStalenessSweepJob();
  void scheduleBookingExpirySweepJob();

  // Mirrors server.ts's graceful-shutdown pattern — previously absent here,
  // so a container SIGTERM (rolling deploy, autoscaler scale-down) killed
  // the process mid-job with no drain. `worker.close()` waits for any
  // currently-processing job to finish (BullMQ's documented graceful-close
  // behavior) before this closes the shared Redis connection and DB pool.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down worker gracefully...`);
    await worker.close();
    await closeQueue();
    await closeDatabase();
    logger.info('Worker shut down');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
