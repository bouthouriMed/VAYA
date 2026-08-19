export const RIDE_STATUSES = [
  'draft',
  'published',
  'full',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

export const RIDE_STATUS_TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  draft: ['published'],
  published: ['full', 'in_progress', 'cancelled'],
  full: ['published', 'in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionRideStatus(from: RideStatus, to: RideStatus): boolean {
  return RIDE_STATUS_TRANSITIONS[from].includes(to);
}
