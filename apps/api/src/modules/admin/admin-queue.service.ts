import { getNotificationDispatchQueue } from '../../lib/queue.js';
import { NotFoundError } from '../../lib/errors.js';

/**
 * The only way to see a failed background job before this existed was
 * direct Redis CLI access (`docs/domain/...`'s own audit note) — BullMQ
 * already retains up to 1000 failed jobs (queue.ts's `removeOnFail`), this
 * just surfaces them through the admin API instead of requiring shell
 * access to the Redis instance to answer "what's actually failing".
 */
export interface FailedJobSummary {
  id: string;
  name: string;
  data: unknown;
  failedReason: string | undefined;
  attemptsMade: number;
  timestamp: number;
  finishedOn: number | undefined;
}

export async function listFailedJobs(limit: number): Promise<FailedJobSummary[]> {
  const queue = getNotificationDispatchQueue();
  if (!queue) return [];

  const jobs = await queue.getFailed(0, Math.max(0, limit - 1));
  return jobs.map((job) => ({
    id: job.id ?? '',
    name: job.name,
    data: job.data,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn,
  }));
}

export async function getFailedJobCount(): Promise<number> {
  const queue = getNotificationDispatchQueue();
  if (!queue) return 0;
  return queue.getFailedCount();
}

/** Re-enqueues a specific failed job for another attempt — the admin-panel
 *  equivalent of BullMQ's own `job.retry()`, for a job an operator has
 *  confirmed is safe to retry (e.g. a transient Expo/Twilio outage that has
 *  since recovered), rather than waiting for the next unrelated deploy to
 *  happen to reprocess it. */
export async function retryFailedJob(jobId: string): Promise<void> {
  const queue = getNotificationDispatchQueue();
  if (!queue) throw new NotFoundError('Queue is unavailable (no REDIS_URL configured)');

  const job = await queue.getJob(jobId);
  if (!job) throw new NotFoundError(`No job found with id ${jobId}`);

  await job.retry();
}
