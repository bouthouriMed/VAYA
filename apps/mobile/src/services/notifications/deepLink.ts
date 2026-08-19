/**
 * Maps a notification event type to the screen a tap should open. Scoped
 * to exactly the event types this and Phase 7 actually dispatch
 * (booking_requested/accepted/declined, message_received) — not a
 * general-purpose deep-linking system (docs/roadmap/phase-07-notifications.md's
 * explicit scope boundary "do not build a general deep-linking system
 * beyond what these notification types need").
 *
 * The three booking_* types resolve to the "Mes trajets" tab: it already
 * renders both a driver's published rides and a rider's bookings
 * ((tabs)/trips.tsx), which is the closest existing screen to each event's
 * subject. A dedicated driver "review this request" screen doesn't exist
 * yet anywhere in this codebase (verified — no accept/decline call site in
 * apps/mobile/app) — a real product gap, not something to build as a side
 * effect of this phase. Once it exists, only this map needs to change.
 *
 * message_received (Phase 8) is the one type that can resolve more
 * specifically: its payload always carries the bookingId
 * (conversations.service.ts's sendMessage), so a tap opens that exact
 * conversation directly rather than the generic trips tab.
 *
 * trip_completed (Phase 9, docs/roadmap/phase-09-ratings-trust.md) also
 * resolves to "Mes trajets": the actual rating *prompt* itself is surfaced
 * by RatingPromptBridge (app/_layout.tsx), mounted globally and polling
 * `GET /trips/pending-rating` on launch — a tap on this notification just
 * needs to bring the app to the foreground into a screen where that bridge
 * is already active, which every screen under the root stack is.
 */
export type NotificationDeepLinkType =
  | 'booking_requested'
  | 'booking_accepted'
  | 'booking_declined'
  | 'message_received'
  | 'trip_completed'
  | (string & {});

export function resolveNotificationDeepLink(
  type: NotificationDeepLinkType,
  payload?: Record<string, unknown>,
): string | null {
  switch (type) {
    case 'booking_requested':
    case 'booking_accepted':
    case 'booking_declined':
    case 'trip_completed':
      return '/(tabs)/trips';
    case 'message_received': {
      const bookingId = payload?.bookingId;
      return typeof bookingId === 'string' ? `/conversations/${bookingId}` : '/(tabs)/trips';
    }
    default:
      return null;
  }
}
