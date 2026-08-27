import type { TFunction } from 'i18next';
import type { IconName } from '@vaya/design-system';
import type { NotificationEventType } from '../../state/api';

export interface NotificationTypeMeta {
  title: string;
  icon: IconName;
}

/**
 * Client-side display copy per event type — the API deliberately returns
 * only `type` + raw `payload` (ids, not prose), since human-readable text
 * belongs at the display layer where locale (`users.locale`: fr/ar/en)
 * applies, not baked into a stored row server-side. Only the first 3 types
 * are ever dispatched a push by this phase; the rest have entries too so
 * the inbox never renders a broken/blank row if one shows up from a later
 * phase's event before that phase ships its own copy.
 */
const NOTIFICATION_TYPE_META: Record<NotificationEventType, (t: TFunction) => NotificationTypeMeta> = {
  booking_requested: (t) => ({ title: t('notifications:events.booking_requested'), icon: 'person-add-outline' }),
  booking_accepted: (t) => ({ title: t('notifications:events.booking_accepted'), icon: 'checkmark-circle-outline' }),
  booking_declined: (t) => ({ title: t('notifications:events.booking_declined'), icon: 'close-circle-outline' }),
  trip_driver_approaching: (t) => ({ title: t('notifications:events.trip_driver_approaching'), icon: 'car-outline' }),
  trip_completed: (t) => ({ title: t('notifications:events.trip_completed'), icon: 'flag-outline' }),
  recurring_pattern_detected: (t) => ({ title: t('notifications:events.recurring_pattern_detected'), icon: 'repeat-outline' }),
  recurring_proactive_match: (t) => ({ title: t('notifications:events.recurring_proactive_match'), icon: 'sparkles-outline' }),
  demand_signal_matched: (t) => ({ title: t('notifications:events.demand_signal_matched'), icon: 'notifications-outline' }),
  message_received: (t) => ({ title: t('notifications:events.message_received'), icon: 'chatbubble-outline' }),
  // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md).
  booking_cancelled: (t) => ({ title: t('notifications:events.booking_cancelled'), icon: 'close-circle-outline' }),
  booking_no_show_reported: (t) => ({ title: t('notifications:events.booking_no_show_reported'), icon: 'alert-circle-outline' }),
  // Live tracking (docs/domain/live-tracking.md).
  trip_pickup_arrived: (t) => ({ title: t('notifications:events.trip_pickup_arrived'), icon: 'location-outline' }),
  trip_arriving: (t) => ({ title: t('notifications:events.trip_arriving'), icon: 'navigate-outline' }),
  trip_tracking_unavailable: (t) => ({ title: t('notifications:events.trip_tracking_unavailable'), icon: 'warning-outline' }),
  // Trip-staleness sweep (packages/domain/src/trip/trip-staleness.ts).
  trip_completion_reminder: (t) => ({ title: t('notifications:events.trip_completion_reminder'), icon: 'checkmark-done-outline' }),
  // Admin verification workflow (docs/domain/verification-workflow.md).
  verification_submitted: (t) => ({ title: t('notifications:events.verification_submitted'), icon: 'time-outline' }),
  verification_approved: (t) => ({ title: t('notifications:events.verification_approved'), icon: 'shield-checkmark-outline' }),
  verification_declined: (t) => ({ title: t('notifications:events.verification_declined'), icon: 'close-circle-outline' }),
  verification_resubmission_required: (t) => ({ title: t('notifications:events.verification_resubmission_required'), icon: 'refresh-outline' }),
};

const FALLBACK_META: (t: TFunction) => NotificationTypeMeta = (t) => ({ title: t('notifications:events.fallback'), icon: 'notifications-outline' });

export function notificationTypeMeta(type: NotificationEventType, t: TFunction): NotificationTypeMeta {
  return (NOTIFICATION_TYPE_META[type] ?? FALLBACK_META)(t);
}

/** Which of AppPalette's few semantic tones (accent/error/info/neutral) an
 *  event reads as — purely a visual grouping for the inbox row's icon
 *  chip, independent of `title`/`icon` above. */
export type NotificationTone = 'accent' | 'error' | 'info' | 'neutral';

const NOTIFICATION_TONE: Partial<Record<NotificationEventType, NotificationTone>> = {
  booking_requested: 'accent',
  booking_accepted: 'accent',
  booking_declined: 'error',
  booking_cancelled: 'error',
  booking_no_show_reported: 'error',
  message_received: 'info',
  trip_completed: 'accent',
  recurring_pattern_detected: 'info',
  recurring_proactive_match: 'info',
  demand_signal_matched: 'info',
  trip_pickup_arrived: 'accent',
  trip_arriving: 'accent',
  trip_tracking_unavailable: 'error',
  trip_completion_reminder: 'info',
  verification_submitted: 'info',
  verification_approved: 'accent',
  verification_declined: 'error',
  verification_resubmission_required: 'error',
};

export function notificationTone(type: NotificationEventType): NotificationTone {
  return NOTIFICATION_TONE[type] ?? 'neutral';
}

/**
 * A real, specific preview line for the inbox row — mirrors the backend's
 * own push-body copy (notifications.service.ts's bodyFor) so the two never
 * drift, built from the same real payload fields (riderName/driverName/
 * seatsRequested — never fabricated when a field is missing, an honest
 * generic fallback instead). The API intentionally never stores this text
 * itself (see this file's own top doc comment on why), so it's derived
 * fresh at render time from `payload` on every screen that shows it.
 */
export function notificationDescription(
  type: NotificationEventType,
  payload: Record<string, unknown>,
  t: TFunction,
): string {
  switch (type) {
    case 'booking_requested': {
      const name = typeof payload.riderName === 'string' ? payload.riderName : undefined;
      const count = typeof payload.seatsRequested === 'number' ? payload.seatsRequested : 1;
      return t('notifications:descriptions.booking_requested', { name, count });
    }
    case 'booking_accepted':
      return t('notifications:descriptions.booking_accepted', { name: typeof payload.driverName === 'string' ? payload.driverName : undefined });
    case 'booking_declined':
      return t('notifications:descriptions.booking_declined', { name: typeof payload.driverName === 'string' ? payload.driverName : undefined });
    case 'message_received':
      return t('notifications:descriptions.message_received', { name: typeof payload.senderName === 'string' ? payload.senderName : undefined });
    case 'trip_completed':
      return t('notifications:descriptions.trip_completed');
    case 'booking_cancelled':
      return t('notifications:descriptions.booking_cancelled');
    case 'booking_no_show_reported':
      return t('notifications:descriptions.booking_no_show_reported');
    case 'trip_driver_approaching':
      return t('notifications:descriptions.trip_driver_approaching', { name: typeof payload.driverName === 'string' ? payload.driverName : undefined });
    case 'recurring_pattern_detected':
      return t('notifications:descriptions.recurring_pattern_detected');
    case 'recurring_proactive_match':
      return t('notifications:descriptions.recurring_proactive_match', { origin: typeof payload.originLabel === 'string' ? payload.originLabel : undefined, destination: typeof payload.destinationLabel === 'string' ? payload.destinationLabel : undefined });
    case 'demand_signal_matched':
      return t('notifications:descriptions.demand_signal_matched', { origin: typeof payload.originLabel === 'string' ? payload.originLabel : undefined, destination: typeof payload.destinationLabel === 'string' ? payload.destinationLabel : undefined });
    case 'trip_pickup_arrived':
      return t('notifications:descriptions.trip_pickup_arrived');
    case 'trip_arriving':
      return t('notifications:descriptions.trip_arriving');
    case 'trip_tracking_unavailable':
      return t('notifications:descriptions.trip_tracking_unavailable');
    case 'trip_completion_reminder':
      return t('notifications:descriptions.trip_completion_reminder');
    case 'verification_submitted':
      return t('notifications:descriptions.verification_submitted');
    case 'verification_approved':
      return t('notifications:descriptions.verification_approved');
    case 'verification_declined':
      return t('notifications:descriptions.verification_declined');
    case 'verification_resubmission_required':
      return t('notifications:descriptions.verification_resubmission_required');
    default:
      return notificationTypeMeta(type, t).title;
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

/** Route/counterpart fields a notification card actually renders (2026-08-23
 *  redesign: passenger mini-profile, route pill, seats badge, pickup time)
 *  — always optional, since a field missing from the raw payload is a real,
 *  honest possibility (an older notification row predating this shape, a
 *  best-effort lookup that failed server-side) and must render as "omitted"
 *  never as fabricated placeholder text. `booking_requested`'s counterpart
 *  is the rider (bookings.service.ts's createBooking payload);
 *  `booking_accepted`/`booking_declined`'s counterpart is the driver — same
 *  shape either direction, so one reader serves both card kinds. */
export interface NotificationCounterpartPayload {
  bookingId?: string;
  rideId?: string;
  /** The counterpart's real userId — riderId (booking_requested) or
   *  driverUserId (booking_accepted/declined), both added to the
   *  notification payload server-side (bookings.service.ts) — lets a tap on
   *  the counterpart's photo open their real public profile (search/trust.tsx,
   *  which works for any userId despite its driver-oriented name — see its
   *  own component doc comment) instead of only the ride/booking itself. */
  counterpartUserId?: string;
  counterpartName?: string;
  counterpartAvatarUrl?: string;
  counterpartRatingAvg?: number;
  seatsRequested?: number;
  pickupLabel?: string;
  originLabel?: string;
  destinationLabel?: string;
  departureAt?: string;
}

export function readNotificationCounterpartPayload(
  type: NotificationEventType,
  payload: Record<string, unknown>,
): NotificationCounterpartPayload {
  const isDriverFacing = type === 'booking_requested';
  const userIdKey = isDriverFacing ? 'riderId' : 'driverUserId';
  const nameKey = isDriverFacing ? 'riderName' : 'driverName';
  const avatarKey = isDriverFacing ? 'riderAvatarUrl' : 'driverAvatarUrl';
  const ratingKey = isDriverFacing ? 'riderRatingAvg' : 'driverRatingAvg';
  return {
    bookingId: str(payload.bookingId),
    rideId: str(payload.rideId),
    counterpartUserId: str(payload[userIdKey]),
    counterpartName: str(payload[nameKey]),
    counterpartAvatarUrl: str(payload[avatarKey]),
    counterpartRatingAvg: num(payload[ratingKey]),
    seatsRequested: num(payload.seatsRequested),
    pickupLabel: str(payload.pickupLabel),
    originLabel: str(payload.originLabel),
    destinationLabel: str(payload.destinationLabel),
    departureAt: str(payload.departureAt),
  };
}
