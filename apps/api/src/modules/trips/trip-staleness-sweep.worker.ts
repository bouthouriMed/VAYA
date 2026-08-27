import type { Job } from 'bullmq';
import type { getDatabase } from '../../lib/database.js';
import type { TripStalenessSweepJobData } from '../../lib/queue.js';
import { runTripStalenessSweep } from './trips.service.js';
import { getLogger } from '../../config/logger.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * The job processor for the `trip-staleness-sweep` job (lib/queue.ts) —
 * mirrors recurring/recurring-pattern-scan.worker.ts's "plain, directly-
 * callable function" shape, kept separate from the `Worker`'s inline
 * callback so it's unit-testable without a real BullMQ Worker/Redis
 * connection, and so worker.ts stays a thin wire-up that just routes by
 * job name.
 */
export async function processTripStalenessSweepJob(
  db: Database,
  _job: Job<TripStalenessSweepJobData>,
): Promise<void> {
  const result = await runTripStalenessSweep(db);
  getLogger().info({ result }, 'Trip-staleness sweep completed');
}
