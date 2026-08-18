export const TRIP_STATUSES = [
  'scheduled',
  'driver_approaching',
  'pickup',
  'active',
  'arriving',
  'completed',
  'no_show',
  'cancelled',
] as const;

export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_STATUS_TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  scheduled: ['driver_approaching', 'cancelled'],
  driver_approaching: ['pickup', 'cancelled'],
  pickup: ['active', 'no_show', 'cancelled'],
  active: ['arriving', 'cancelled'],
  arriving: ['completed'],
  completed: [],
  no_show: [],
  cancelled: [],
};

export function canTransitionTripStatus(from: TripStatus, to: TripStatus): boolean {
  return TRIP_STATUS_TRANSITIONS[from].includes(to);
}
