import { readablePlaceLabel, shortPlaceLabel } from '@vaya/domain';

/**
 * Display helpers for stored place labels (rides.originLabel, booking
 * pickup/dropoff labels, ...). The parsing itself lives in `@vaya/domain`
 * (route/place-label.ts) so the API, which cleans labels as it geocodes
 * them, and the app, which also has to display rows stored before that,
 * share one rule. Real labels look like "R4MF+76P، Rue 6863، Tunis,
 * Tunisia" — a Plus Code plus Arabic commas — so neither helper ever
 * shows the Plus Code.
 */

/** A compact "place, locality" title for cards and headers —
 *  "Rue 6863, Tunis". The full address belongs in the itinerary below it. */
export function shortenPlaceLabel(label: string): string {
  return shortPlaceLabel(label);
}

/** The full address for itinerary rows — "Rue 6863, Tunis, Tunisia". */
export function fullPlaceLabel(label: string): string {
  return readablePlaceLabel(label);
}
