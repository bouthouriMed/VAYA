/**
 * Maps a notification event type to the screen a tap should open. Scoped
 * to exactly the event types this and Phase 7 actually dispatch
 * (booking_requested/accepted/declined, message_received) — not a
 * general-purpose deep-linking system (docs/roadmap/phase-07-notifications.md's
 * explicit scope boundary "do not build a general deep-linking system
 * beyond what these notification types need").
 *
 * booking_accepted/booking_declined resolve to the "Mes trajets" tab — it
 * already renders a rider's bookings ((tabs)/trips.tsx), the closest
 * existing screen to those events' subject.
 *
 * booking_requested resolves more specifically: its payload always carries
 * `rideId` (bookings.service.ts's createBooking), so a tap opens Mes trajets
 * *with that ride's request sheet already open*
 * (`?openRequestsForRide=<rideId>`, read by trips.tsx) — a driver taps the
 * notification and lands directly on the request they can accept/decline,
 * not just the dashboard they'd have to navigate from manually. (An earlier
 * version of this file described this as "a real product gap" — that
 * screen, RideRequestsSheet, has existed since a "booking (wip)" commit;
 * this comment was simply never updated.)
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
 *
 * recurring_pattern_detected/recurring_proactive_match (Phase 11,
 * docs/roadmap/phase-11-recurring-rides.md) resolve to the new
 * `/recurring` pattern-management screen — the detection-prompt bottom
 * sheet itself is surfaced proactively by RecurringPatternPromptBridge
 * (app/_layout.tsx, the same "global bridge polling on launch" pattern
 * RatingPromptBridge established), so a tap here just needs to land
 * somewhere that shows the pattern (its list of patterns), not open the
 * sheet directly — there's no dedicated single-pattern detail screen.
 *
 * trip_arriving/trip_tracking_unavailable (live tracking, docs/domain/
 * live-tracking.md) both carry `{tripId, bookingId}` (trips.service.ts's
 * updateTripLocation/reportTrackingIssue notifyBestEffort calls) — neither
 * carries the driverName/destinationLabel/etc. bookings/live.tsx's screen
 * params currently expect (it's normally reached via bookings/pickup.tsx's
 * "J'y suis" button, which already has all of that in hand). Rather than
 * open a live-tracking screen mid-render with half its expected params
 * missing, this resolves to the "Mes trajets" tab — same honest "good
 * enough, not perfect" tradeoff this file already documents for
 * booking_accepted/declined above; the rider can tap into the real booking
 * from there and reach live.tsx with everything it needs.
 *
 * verification_submitted/approved/declined all resolve to
 * `/driver/onboarding/confirmation`, which now reads the driver's REAL
 * current `verificationStatus` (not a one-time `status` param) — a tap on
 * any of these three always shows the true current state, not just what
 * the notification was about. verification_resubmission_required is the
 * one type that resolves more specifically, matching this file's
 * `booking_requested`/`message_received` precedent: it sends the driver
 * straight to `/driver/onboarding/resubmit`, the exact actionable screen,
 * since there is real, specific work to do there and nothing to gain by
 * making them navigate to it themselves.
 */
export type NotificationDeepLinkType =
  | 'booking_requested'
  | 'booking_accepted'
  | 'booking_declined'
  | 'message_received'
  | 'trip_completed'
  | 'recurring_pattern_detected'
  | 'recurring_proactive_match'
  | 'trip_arriving'
  | 'trip_tracking_unavailable'
  | 'verification_submitted'
  | 'verification_approved'
  | 'verification_declined'
  | 'verification_resubmission_required'
  | (string & {});

export function resolveNotificationDeepLink(
  type: NotificationDeepLinkType,
  payload?: Record<string, unknown>,
): string | null {
  switch (type) {
    case 'booking_requested': {
      const rideId = payload?.rideId;
      return typeof rideId === 'string'
        ? `/(tabs)/trips?openRequestsForRide=${encodeURIComponent(rideId)}`
        : '/(tabs)/trips';
    }
    case 'booking_accepted':
    case 'booking_declined':
    case 'trip_completed':
    case 'trip_arriving':
    case 'trip_tracking_unavailable':
      return '/(tabs)/trips';
    case 'message_received': {
      const bookingId = payload?.bookingId;
      return typeof bookingId === 'string' ? `/conversations/${bookingId}` : '/(tabs)/trips';
    }
    case 'recurring_pattern_detected':
    case 'recurring_proactive_match':
      return '/recurring';
    case 'verification_submitted':
    case 'verification_approved':
    case 'verification_declined':
      return '/driver/onboarding/confirmation';
    case 'verification_resubmission_required':
      return '/driver/onboarding/resubmit';
    default:
      return null;
  }
}
