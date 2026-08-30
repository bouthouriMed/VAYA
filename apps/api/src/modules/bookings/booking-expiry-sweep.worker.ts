import type { Job } from 'bullmq';
import type { getDatabase } from '../../lib/database.js';
import type { BookingExpirySweepJobData } from '../../lib/queue.js';
import { runBookingExpirySweep } from './bookings.service.js';
import { getLogger } from '../../config/logger.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * The job processor for the `booking-expiry-sweep` job (lib/queue.ts) —
 * mirrors trips/trip-staleness-sweep.worker.ts's "plain, directly-callable
 * function" shape.
 */
export async function processBookingExpirySweepJob(
  db: Database,
  _job: Job<BookingExpirySweepJobData>,
): Promise<void> {
  const result = await runBookingExpirySweep(db);
  getLogger().info({ result }, 'Booking-expiry sweep completed');
}
