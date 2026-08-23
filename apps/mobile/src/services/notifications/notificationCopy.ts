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
const NOTIFICATION_TYPE_META: Record<NotificationEventType, NotificationTypeMeta> = {
  booking_requested: { title: 'Nouvelle demande de réservation', icon: 'person-add-outline' },
  booking_accepted: { title: 'Réservation acceptée', icon: 'checkmark-circle-outline' },
  booking_declined: { title: 'Réservation refusée', icon: 'close-circle-outline' },
  trip_driver_approaching: { title: 'Votre conducteur approche', icon: 'car-outline' },
  trip_completed: { title: 'Trajet terminé', icon: 'flag-outline' },
  recurring_pattern_detected: { title: 'Trajet récurrent détecté', icon: 'repeat-outline' },
  recurring_proactive_match: { title: 'Nouveau trajet correspondant', icon: 'sparkles-outline' },
  demand_signal_matched: { title: 'Un trajet correspond à votre demande', icon: 'notifications-outline' },
  message_received: { title: 'Nouveau message', icon: 'chatbubble-outline' },
  // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md).
  booking_cancelled: { title: 'Réservation annulée', icon: 'close-circle-outline' },
  booking_no_show_reported: { title: 'Absence signalée', icon: 'alert-circle-outline' },
};

const FALLBACK_META: NotificationTypeMeta = { title: 'Notification', icon: 'notifications-outline' };

export function notificationTypeMeta(type: NotificationEventType): NotificationTypeMeta {
  return NOTIFICATION_TYPE_META[type] ?? FALLBACK_META;
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
): string {
  switch (type) {
    case 'booking_requested': {
      const seats = typeof payload.seatsRequested === 'number' ? payload.seatsRequested : undefined;
      const seatsLabel = seats ? (seats > 1 ? `${seats} places` : 'une place') : 'une place';
      return typeof payload.riderName === 'string'
        ? `${payload.riderName} souhaite réserver ${seatsLabel}.`
        : 'Une nouvelle demande de réservation attend votre réponse.';
    }
    case 'booking_accepted':
      return typeof payload.driverName === 'string'
        ? `${payload.driverName} a accepté votre demande.`
        : 'Votre demande de réservation a été acceptée.';
    case 'booking_declined':
      return typeof payload.driverName === 'string'
        ? `${payload.driverName} n'a pas pu accepter votre demande.`
        : 'Votre demande de réservation a été refusée.';
    case 'message_received':
      return typeof payload.senderName === 'string'
        ? `${payload.senderName} vous a envoyé un message.`
        : 'Vous avez reçu un nouveau message.';
    case 'trip_completed':
      return 'Votre trajet est terminé — notez votre expérience.';
    case 'booking_cancelled':
      return 'Un trajet réservé vient d’être annulé.';
    case 'booking_no_show_reported':
      return 'Une absence a été signalée pour ce trajet.';
    default:
      return notificationTypeMeta(type).title;
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
  const nameKey = isDriverFacing ? 'riderName' : 'driverName';
  const avatarKey = isDriverFacing ? 'riderAvatarUrl' : 'driverAvatarUrl';
  const ratingKey = isDriverFacing ? 'riderRatingAvg' : 'driverRatingAvg';
  return {
    bookingId: str(payload.bookingId),
    rideId: str(payload.rideId),
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
