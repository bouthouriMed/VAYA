import type { AnalyticsEventInput } from '../../state/api';

/**
 * Pure mapping from an arbitrary `trackEvent(name, payload)` call site onto
 * `analyticsEventsIngestSchema`'s shape (packages/validation/src/admin.ts)
 * — no React, no network, deterministic given its inputs (same discipline
 * as myRidesHelpers.ts/cancellationHelpers.ts). Kept in its own file, with
 * only a type-level dependency on state/api, so it can be unit-tested
 * without pulling in the real Redux store/RTK Query runtime that
 * analytics.ts's actual dispatch side needs.
 */
export type AnalyticsEventPayload = Record<string, string | number | boolean | null | undefined>;

// The 12 named columns analyticsEventsIngestSchema recognizes — everything
// else in a call site's payload lands in `metadata` instead of being
// dropped.
const NAMED_FIELDS = new Set([
  'searchId',
  'originLabel',
  'originLat',
  'originLng',
  'destinationLabel',
  'destinationLat',
  'destinationLng',
  'desiredDepartureAt',
  'seats',
  'resultCount',
  'matchTier',
  'selectedRideId',
  'durationMs',
]);

export function toEventInput(name: string, payload: AnalyticsEventPayload): AnalyticsEventInput {
  const event: AnalyticsEventInput = { eventName: name.slice(0, 64) };
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (NAMED_FIELDS.has(key)) {
      (event as unknown as Record<string, unknown>)[key] = value;
    } else {
      metadata[key] = value;
    }
  }
  if (Object.keys(metadata).length > 0) event.metadata = metadata;
  return event;
}
