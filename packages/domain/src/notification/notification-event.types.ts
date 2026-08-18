import type { TimestampedEntity, UUID } from '../shared/base.types.js';

export const NOTIFICATION_EVENT_TYPES = [
  'booking_requested',
  'booking_accepted',
  'booking_declined',
  'trip_driver_approaching',
  'trip_completed',
  'recurring_pattern_detected',
  'recurring_proactive_match',
  'demand_signal_matched',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export interface NotificationEvent extends TimestampedEntity {
  userId: UUID;
  type: NotificationEventType;
  payload: Record<string, unknown>;
  readAt: Date | null;
}
