/**
 * Maps a notification event type to the screen a tap should open. Scoped
 * to exactly the 3 event types this phase actually dispatches
 * (booking_requested/accepted/declined) — not a general-purpose deep-
 * linking system (docs/roadmap/phase-07-notifications.md's explicit scope
 * boundary "do not build a general deep-linking system beyond what these
 * notification types need").
 *
 * All three currently resolve to the same "Mes trajets" tab: it already
 * renders both a driver's published rides and a rider's bookings
 * ((tabs)/trips.tsx), which is the closest existing screen to each event's
 * subject. A dedicated driver "review this request" screen doesn't exist
 * yet anywhere in this codebase (verified — no accept/decline call site in
 * apps/mobile/app) — a real product gap, not something to build as a side
 * effect of this phase. Once it exists, only this map needs to change.
 */
export type NotificationDeepLinkType =
  | 'booking_requested'
  | 'booking_accepted'
  | 'booking_declined'
  | (string & {});

export function resolveNotificationDeepLink(type: NotificationDeepLinkType): string | null {
  switch (type) {
    case 'booking_requested':
    case 'booking_accepted':
    case 'booking_declined':
      return '/(tabs)/trips';
    default:
      return null;
  }
}
