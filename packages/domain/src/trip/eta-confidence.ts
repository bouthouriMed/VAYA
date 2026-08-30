import type { TrackingStatus } from './tracking-status';

/**
 * ETA confidence classification (spec P7 "Never expose false certainty" —
 * matrix M-007): "ETAs are estimates. VAYA should distinguish: estimated,
 * confirmed, inferred, unavailable."
 *
 * Reuses the existing `TrackingStatus` (GPS feed health) rather than
 * inventing a second, parallel feed-health concept (CLAUDE.md: don't
 * duplicate authoritative state) and maps it onto the spec's own 4-value ETA
 * confidence vocabulary:
 *
 *  - `unavailable` feed -> `unavailable`: nothing to base an ETA on at all.
 *  - `stale` feed -> `inferred`: a last-known position exists, so an ETA can
 *    be *inferred* from it, but it is explicitly not live-confirmed.
 *  - `live` feed + a real routing-engine-derived route (not a haversine
 *    fallback) -> `confirmed`: the strongest case VAYA can offer today.
 *  - `live` feed + a haversine-fallback route -> `estimated`: the position is
 *    real-time, but the route/duration under it is itself a rough estimate
 *    (reuses `docs/domain/pricing.md`'s existing `routeIsEstimate` concept).
 *  - `not_started`/`starting`/`completed` -> `estimated`: a schedule-only ETA
 *    with no live signal behind it (yet, or any more).
 *
 * Pure function: no I/O.
 */
export type EtaConfidence = 'estimated' | 'confirmed' | 'inferred' | 'unavailable';

export interface EtaConfidenceInput {
  trackingStatus: TrackingStatus;
  /** Whether the ETA's underlying route came from a real routing engine
   *  (OSRM/Google) rather than a haversine fallback. */
  hasRealRouteData: boolean;
}

export function classifyEtaConfidence(input: EtaConfidenceInput): EtaConfidence {
  const { trackingStatus, hasRealRouteData } = input;

  if (trackingStatus === 'unavailable') return 'unavailable';
  if (trackingStatus === 'stale') return 'inferred';
  if (trackingStatus === 'live') return hasRealRouteData ? 'confirmed' : 'estimated';
  // not_started / starting / completed
  return 'estimated';
}
