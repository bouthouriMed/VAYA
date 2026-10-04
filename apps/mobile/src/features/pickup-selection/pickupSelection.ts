import type { RankedStop } from '../../state/api';

/**
 * The stop pre-selected by default when search/pickup-point.tsx first
 * loads a ride's ranked candidates — the closest/best-ranked one
 * (matching.service.ts's `rankStopsByWalkDistance` already sorts
 * ascending, so this is always index 0). Map-first UX per
 * docs/ux/principles.md #1: the passenger shouldn't have to scan a list
 * before anything is chosen. Returns null when there is nothing to select.
 */
export function defaultStopId(rankedStops: RankedStop[], recommendedStopId?: string | null): string | null {
  // The server's recommendation (matching.service.ts's resolvePassengerSegment
  // — the best walk/detour balance that also keeps pickup before dropoff)
  // wins whenever it's one of the offered stops; otherwise the closest.
  if (recommendedStopId && rankedStops.some((s) => s.stopId === recommendedStopId)) return recommendedStopId;
  return rankedStops[0]?.stopId ?? null;
}

/**
 * The dropoff stops still reachable after the passenger's chosen pickup:
 * only those strictly later along the driver's route (createBooking rejects
 * any other order). A stop with no known route position is kept — the
 * server re-validates the order anyway.
 */
export function dropoffStopsAfterPickup(
  rankedDropoffStops: RankedStop[],
  pickupSequence: number | null | undefined,
): RankedStop[] {
  if (pickupSequence == null) return rankedDropoffStops;
  return rankedDropoffStops.filter((s) => s.sequence == null || s.sequence > pickupSequence);
}

/**
 * 0-based position of a stop within its ranked list — feeds the
 * `pickup_stop_selected` analytics event's "which ranked position was
 * chosen" signal (docs/roadmap/phase-05-ride-engine-passenger-selection.md).
 * -1 if the stop isn't in the list (shouldn't happen given the UI only
 * ever offers stops from this exact list, but a defensive value beats
 * throwing from an analytics call site).
 */
export function rankedPosition(rankedStops: RankedStop[], stopId: string): number {
  return rankedStops.findIndex((s) => s.stopId === stopId);
}
