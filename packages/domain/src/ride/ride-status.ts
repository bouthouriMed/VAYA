export const RIDE_STATUSES = [
  'draft',
  'published',
  'full',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

export const RIDE_STATUS_TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  draft: ['published'],
  published: ['full', 'in_progress', 'cancelled', 'expired'],
  full: ['published', 'in_progress', 'cancelled', 'expired'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  // Terminal: the ride's departure came and went and it was never driven.
  // Set only by the system (ride-expiry.ts), never by a user action — kept
  // distinct from `cancelled` so "the driver cancelled" (a reliability
  // signal) and "nothing happened" never share one status.
  expired: [],
};

export function canTransitionRideStatus(from: RideStatus, to: RideStatus): boolean {
  return RIDE_STATUS_TRANSITIONS[from].includes(to);
}
