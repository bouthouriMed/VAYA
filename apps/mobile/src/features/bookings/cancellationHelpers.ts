import type { CancellationTier } from '../../state/api';

/**
 * VAYA-branded label + the existing `Badge` variant for a computed
 * cancellation tier (packages/domain/src/booking/cancellation-policy.ts) —
 * kept here (not the design system) since it's product copy/mapping, not a
 * new visual pattern, same precedent as ratingHelpers.ts's trustTierBadge.
 * Deliberately not importing `@vaya/design-system` here at all: that
 * package's entrypoint pulls in the real `react-native` module graph, which
 * apps/mobile's plain Node/Vite test environment can't parse (the same
 * constraint priceSelection.ts documents) — returning a plain Badge
 * `variant` string lets the screen component do `<Badge variant={...} />`
 * without this pure helper ever touching react-native itself. The
 * consequence *sentence* itself always comes straight from the server
 * (`CancellationPolicy.consequence`) — this only supplies the short badge
 * label and tone for it.
 */
export function cancellationTierBadge(
  tier: CancellationTier,
): { label: string; variant: 'success' | 'warning' | 'error' } {
  switch (tier) {
    case 'free':
      return { label: 'Gratuite', variant: 'success' };
    case 'moderate':
      return { label: 'Tardive', variant: 'warning' };
    case 'severe':
      return { label: 'Dernière minute', variant: 'error' };
    default:
      return { label: 'Annulation', variant: 'error' };
  }
}

/**
 * Human-readable "when" for the preview sheet — e.g. "Départ dans 2 h" or
 * "Départ il y a 12 min" once departure has already passed. Pure formatting
 * only; the actual tier boundary logic lives entirely in
 * packages/domain/src/booking/cancellation-policy.ts, not re-derived here.
 */
export function formatMinutesUntilDeparture(minutesBeforeDeparture: number): string {
  const isPast = minutesBeforeDeparture < 0;
  const absMinutes = Math.round(Math.abs(minutesBeforeDeparture));

  const magnitude =
    absMinutes < 60
      ? `${absMinutes} min`
      : absMinutes < 24 * 60
        ? `${Math.floor(absMinutes / 60)} h`
        : `${Math.floor(absMinutes / (24 * 60))} j`;

  return isPast ? `Départ il y a ${magnitude}` : `Départ dans ${magnitude}`;
}

/** The `booking_cancelled` analytics event's payload — "by role, by
 *  time-to-departure bucket" (docs/roadmap/phase-10-cancellation-no-show.md's
 *  Analytics section), where the tier itself already *is* the bucket, so
 *  there's no second bucketing scheme to keep in sync with the policy.
 *  Returns a plain string-keyed record (not a named interface) so it's
 *  directly assignable to trackEvent's `AnalyticsEventPayload` index
 *  signature without a cast. */
export function buildCancellationAnalyticsPayload(
  role: 'rider' | 'driver',
  tier: CancellationTier,
): Record<string, string> {
  return { role, timeBucket: tier };
}
