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
  // Journey-contract second pass (docs/unified_driver_and_passenger_journey.md
  // §33, §51, M-096/097, EDGE-051): the passenger's own boarding-confirmed
  // moment (auto-detected or manually confirmed) — the exact moment
  // passenger-facing live tracking becomes available (M-094/INV-06) — and
  // a real, meaningfully-detected route deviation ("inform affected users
  // when their journey meaningfully changes").
  'trip_passenger_onboard',
  'trip_route_deviation',
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
  // M-113 (docs/unified_driver_and_passenger_journey.md §39, journey-contract
  // second pass) — must stay in sync with
  // apps/api/src/db/schema/notifications.schema.ts's notificationEventTypeEnum,
  // which carries the full reasoning for each of these 4.
  'booking_deadline_approaching',
  'booking_sibling_cancelled',
  'trip_active',
  'trip_eta_changed',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export interface NotificationEvent extends TimestampedEntity {
  userId: UUID;
  type: NotificationEventType;
  payload: Record<string, unknown>;
  readAt: Date | null;
}
