import type { RouteStop } from '../../state/api';

/**
 * Toggles a stop id in/out of a selection set, returning a new Set (never
 * mutates the input) — the core interaction the stop-selection step of
 * `driver/publish.tsx` implements via a tap on a candidate marker or its
 * BottomSheet detail view. Pulled out of the screen per CLAUDE.md's mobile
 * convention ("routes compose screens, logic lives in features") and so it
 * can be unit-tested without a React Native rendering harness (none exists
 * in this repo yet — see apps/mobile/src/__tests__ for the established
 * pattern of testing extracted logic directly instead).
 */
export function toggleStopSelection(selected: ReadonlySet<string>, stopId: string): Set<string> {
  const next = new Set(selected);
  if (next.has(stopId)) {
    next.delete(stopId);
  } else {
    next.add(stopId);
  }
  return next;
}

export interface StopSelectionUpdate {
  stopId: string;
  isDriverSelected: boolean;
}

/**
 * Builds the `PATCH /rides/:id/stops` request body from the driver's local
 * selection state. Every generated candidate gets an explicit
 * `isDriverSelected` value (true for selected, false otherwise) so
 * deselecting a previously-selected candidate is expressed, not just
 * omitted from the payload.
 */
export function buildStopSelectionPayload(
  candidates: RouteStop[],
  selected: ReadonlySet<string>,
): StopSelectionUpdate[] {
  return candidates.map((c) => ({ stopId: c.id, isDriverSelected: selected.has(c.id) }));
}
