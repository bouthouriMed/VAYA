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
};

const FALLBACK_META: NotificationTypeMeta = { title: 'Notification', icon: 'notifications-outline' };

export function notificationTypeMeta(type: NotificationEventType): NotificationTypeMeta {
  return NOTIFICATION_TYPE_META[type] ?? FALLBACK_META;
}
