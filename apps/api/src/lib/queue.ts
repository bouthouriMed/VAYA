import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { getEnv } from '../config/env.js';
import { getLogger } from '../config/logger.js';

/**
 * First (and, per docs/roadmap/phase-07-notifications.md's explicit scope,
 * only) background job queue in this codebase — one queue, dispatched by
 * one worker process (src/worker.ts). Resist growing this into a general
 * multi-queue job framework until a second, genuinely distinct use case
 * actually justifies it (CLAUDE.md engineering standards).
 *
 * Phase 11 (docs/roadmap/phase-11-recurring-rides.md) adds a second *job
 * type* on this exact same queue/worker/connection — the periodic
 * recurring-pattern detection scan — rather than standing up a second
 * queue. Job names (`'dispatch'` vs `'recurring-pattern-scan'`) distinguish
 * the two within the one queue; worker.ts routes by `job.name`.
 */
export const NOTIFICATION_DISPATCH_QUEUE = 'notification-dispatch';

export const DISPATCH_JOB_NAME = 'dispatch';
export const RECURRING_PATTERN_SCAN_JOB_NAME = 'recurring-pattern-scan';
// Trip-staleness sweep (packages/domain/src/trip/trip-staleness.ts) — a
// third job type on this same one queue, same "job.name routes it" pattern
// Phase 11 already established for the recurring-pattern scan.
export const TRIP_STALENESS_SWEEP_JOB_NAME = 'trip-staleness-sweep';

// Stable id for the repeatable recurring-pattern-scan job — BullMQ
// deduplicates repeatable jobs registered with the same id/options, so
// re-registering it on every worker process start (worker.ts) is an
// idempotent no-op rather than accumulating duplicate schedules.
export const RECURRING_PATTERN_SCAN_REPEATABLE_JOB_ID = 'recurring-pattern-scan-schedule';
export const TRIP_STALENESS_SWEEP_REPEATABLE_JOB_ID = 'trip-staleness-sweep-schedule';

// How often the recurring-pattern scan runs — an operational cadence
// constant, not a business threshold (those live in
// recurring_detection_configs, per this phase's externalized-tunable
// requirement), so it's fine as a plain constant here.
export const RECURRING_PATTERN_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Every 15 minutes — frequent enough that the sweep's own
// TRIP_COMPLETION_REMINDER_GRACE_MS (30 min) and TRIP_AUTO_CLOSE_GRACE_MS
// (3h) thresholds (packages/domain/src/trip/trip-staleness.ts) don't drift
// far past their intended timing, cheap enough (a handful of trips at any
// moment, at most) not to matter running this often.
export const TRIP_STALENESS_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

export interface NotificationDispatchJobData {
  notificationId: string;
}

// No payload: the scan always operates over every user's current history,
// not a specific target passed at enqueue time.
export type RecurringPatternScanJobData = Record<string, never>;

// No payload: the sweep always operates over every currently-trackable
// trip, not a specific target passed at enqueue time.
export type TripStalenessSweepJobData = Record<string, never>;

export type QueueJobData = NotificationDispatchJobData | RecurringPatternScanJobData | TripStalenessSweepJobData;

let _connection: IORedis | null = null;
let _queue: Queue<QueueJobData> | null = null;

/**
 * BullMQ requires its own Redis connection to be configured with
 * `maxRetriesPerRequest: null` (its documented requirement, so blocking
 * calls aren't cut short) — incompatible with lib/cache.ts's client, which
 * deliberately wants bounded retries for request/response memoization.
 * This still reuses "the existing Redis" per this phase's scope in the
 * sense that matters: the same `REDIS_URL`/deployment, not a second Redis
 * server — just a second logical client against it, which BullMQ needs
 * regardless of what else talks to that instance.
 */
export function getQueueConnection(): IORedis | null {
  const env = getEnv();
  if (!env.REDIS_URL) return null;
  if (!_connection) {
    _connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    _connection.on('error', (err) => {
      getLogger().error({ err }, 'Notification queue Redis connection error');
    });
  }
  return _connection;
}

export function getNotificationDispatchQueue(): Queue<QueueJobData> | null {
  const connection = getQueueConnection();
  if (!connection) return null;
  if (!_queue) {
    _queue = new Queue<QueueJobData>(NOTIFICATION_DISPATCH_QUEUE, { connection });
  }
  return _queue;
}

/**
 * Enqueues a dispatch job for an already-created `notifications` row.
 * Deliberately never throws: a queue/Redis failure here must not fail the
 * caller's primary action (e.g. accepting a booking) — logged and
 * swallowed instead, per this phase's business rule.
 */
export async function enqueueNotificationDispatch(notificationId: string): Promise<void> {
  const queue = getNotificationDispatchQueue();
  if (!queue) {
    getLogger().warn(
      { notificationId },
      'Notification queue unavailable (no REDIS_URL) — skipping dispatch enqueue',
    );
    return;
  }
  try {
    await queue.add(
      DISPATCH_JOB_NAME,
      { notificationId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    );
  } catch (err) {
    getLogger().error({ err, notificationId }, 'Failed to enqueue notification dispatch job');
  }
}

/**
 * Registers the periodic recurring-pattern-scan job as a BullMQ repeatable
 * job (Phase 11), via `upsertJobScheduler` — this installed BullMQ version
 * (6.x) moved repeatable-job registration off `Queue.add`'s `repeat` option
 * (removed entirely from `JobsOptions`) onto this dedicated scheduler API.
 * Called once from worker.ts at process start — idempotent (same scheduler
 * id), so running multiple worker instances/restarts never accumulates
 * duplicate schedules. Never throws, mirroring
 * enqueueNotificationDispatch's "queue unavailable is a warning, not a
 * failure" contract.
 */
export async function scheduleRecurringPatternScanJob(): Promise<void> {
  const queue = getNotificationDispatchQueue();
  if (!queue) {
    getLogger().warn(
      'Notification queue unavailable (no REDIS_URL) — skipping recurring-pattern-scan schedule',
    );
    return;
  }
  try {
    await queue.upsertJobScheduler(
      RECURRING_PATTERN_SCAN_REPEATABLE_JOB_ID,
      { every: RECURRING_PATTERN_SCAN_INTERVAL_MS },
      {
        name: RECURRING_PATTERN_SCAN_JOB_NAME,
        data: {},
        opts: { removeOnComplete: { count: 20 }, removeOnFail: { count: 20 } },
      },
    );
  } catch (err) {
    getLogger().error({ err }, 'Failed to schedule recurring-pattern-scan job');
  }
}

/**
 * Registers the periodic trip-staleness sweep as a BullMQ repeatable job —
 * same mechanism/idempotency contract as scheduleRecurringPatternScanJob
 * above (upsertJobScheduler, stable id, safe to call on every worker
 * process start).
 */
export async function scheduleTripStalenessSweepJob(): Promise<void> {
  const queue = getNotificationDispatchQueue();
  if (!queue) {
    getLogger().warn(
      'Notification queue unavailable (no REDIS_URL) — skipping trip-staleness-sweep schedule',
    );
    return;
  }
  try {
    await queue.upsertJobScheduler(
      TRIP_STALENESS_SWEEP_REPEATABLE_JOB_ID,
      { every: TRIP_STALENESS_SWEEP_INTERVAL_MS },
      {
        name: TRIP_STALENESS_SWEEP_JOB_NAME,
        data: {},
        opts: { removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } },
      },
    );
  } catch (err) {
    getLogger().error({ err }, 'Failed to schedule trip-staleness-sweep job');
  }
}

export async function closeQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}
