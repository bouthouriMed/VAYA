import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { getEnv } from '../config/env.js';
import { getLogger } from '../config/logger.js';

/**
 * First (and, per docs/roadmap/phase-07-notifications.md's explicit scope,
 * only) background job queue in this codebase — one queue, one job type,
 * dispatched by one worker process (src/worker.ts). Resist growing this
 * into a general multi-queue job framework until a second, genuinely
 * distinct use case actually justifies it (CLAUDE.md engineering
 * standards).
 */
export const NOTIFICATION_DISPATCH_QUEUE = 'notification-dispatch';

export interface NotificationDispatchJobData {
  notificationId: string;
}

let _connection: IORedis | null = null;
let _queue: Queue<NotificationDispatchJobData> | null = null;

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

export function getNotificationDispatchQueue(): Queue<NotificationDispatchJobData> | null {
  const connection = getQueueConnection();
  if (!connection) return null;
  if (!_queue) {
    _queue = new Queue<NotificationDispatchJobData>(NOTIFICATION_DISPATCH_QUEUE, { connection });
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
      'dispatch',
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
