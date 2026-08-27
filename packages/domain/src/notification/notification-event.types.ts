import type { TimestampedEntity, UUID } from '../shared/base.types';

export const NOTIFICATION_EVENT_TYPES = [
  'booking_requested',
  'booking_accepted',
  'booking_declined',
  'trip_driver_approaching',
  'trip_completed',
  'recurring_pattern_detected',
  'recurring_proactive_match',
  'demand_signal_matched',
  'message_received',
  // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md): dispatched to
  // the *other* party (never the actor) when a booking is cancelled, or
  // when either party reports the other as a no-show.
  'booking_cancelled',
  'booking_no_show_reported',
  // Live tracking (docs/domain/live-tracking.md).
  'trip_pickup_arrived',
  'trip_arriving',
  'trip_tracking_unavailable',
  // Trip-staleness sweep (packages/domain/src/trip/trip-staleness.ts) — a
  // trip that's still non-terminal well past its expected arrival gets one
  // reminder nudge before the sweep eventually closes it on its own.
  'trip_completion_reminder',
  // Admin verification workflow (docs/domain/verification-workflow.md).
  'verification_submitted',
  'verification_approved',
  'verification_declined',
  'verification_resubmission_required',
  // Ratings & trust (docs/domain/model.md): dispatched to whichever party
  // (driver or rider) was just rated, the moment the other party submits a
  // rating (ratings.service.ts's createRating) or an automatic no-show
  // rating is recorded (recordAutomaticNoShowRating) — symmetric for both
  // roles, unlike most other event types here which are role-specific.
  'rating_received',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export interface NotificationEvent extends TimestampedEntity {
  userId: UUID;
  type: NotificationEventType;
  payload: Record<string, unknown>;
  readAt: Date | null;
}
