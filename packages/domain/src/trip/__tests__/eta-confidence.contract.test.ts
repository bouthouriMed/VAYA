import { describe, it, expect } from 'vitest';
import { classifyEtaConfidence } from '../eta-confidence';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-007) — spec P7
 * "Never expose false certainty":
 *
 *   "ETAs are estimates. VAYA should distinguish: estimated, confirmed,
 *    inferred, unavailable."
 *
 * Confirmed 100% missing today: nothing in the codebase surfaces this
 * 4-value classification anywhere — `TrackingStatus`
 * (packages/domain/src/trip/tracking-status.ts) already distinguishes GPS
 * *feed health* (`live`/`stale`/`unavailable`/...), but nothing maps that
 * onto an ETA *confidence* label a UI could actually render. This file
 * specifies the intended pure function `classifyEtaConfidence`, placed
 * alongside `tracking-status.ts` in the same `trip/` module (not a new
 * top-level concept) and deliberately REUSING the existing `TrackingStatus`
 * type rather than inventing a second, parallel feed-health concept
 * (CLAUDE.md: don't duplicate authoritative state). Not yet implemented —
 * RED, Category B.
 *
 * Mapping rationale (documented, not asserted as the only possible one):
 *  - `unavailable` feed -> `unavailable` ETA confidence: nothing to base an
 *    ETA on at all.
 *  - `stale` feed -> `inferred`: we still have a last-known position, so an
 *    ETA can be *inferred* from it, but it is explicitly not live-confirmed.
 *  - `live` feed + a real routing-engine-derived route (not a haversine
 *    fallback) -> `confirmed`: the strongest case VAYA can offer today.
 *  - `live` feed + a haversine-fallback route -> `estimated`: the position
 *    is real-time, but the route/duration under it is itself a rough
 *    estimate (see `docs/domain/pricing.md`'s existing `routeIsEstimate`
 *    concept, which this reuses rather than inventing a new one).
 *  - `not_started`/`starting` (pre-trip, or GPS not yet reporting) ->
 *    `estimated`: a schedule-only ETA with no live signal behind it yet.
 */

describe('classifyEtaConfidence — ETA confidence classification (M-007, P7)', () => {
  it('unavailable tracking feed -> unavailable confidence, regardless of route quality', () => {
    expect(classifyEtaConfidence({ trackingStatus: 'unavailable', hasRealRouteData: true })).toBe('unavailable');
    expect(classifyEtaConfidence({ trackingStatus: 'unavailable', hasRealRouteData: false })).toBe('unavailable');
  });

  it('stale tracking feed -> inferred (a last-known position exists, but is not live)', () => {
    expect(classifyEtaConfidence({ trackingStatus: 'stale', hasRealRouteData: true })).toBe('inferred');
  });

  it('live feed + real routing-engine route data -> confirmed, the strongest case', () => {
    expect(classifyEtaConfidence({ trackingStatus: 'live', hasRealRouteData: true })).toBe('confirmed');
  });

  it('live feed + haversine-fallback route -> estimated, never confirmed (P7: never claim more certainty than the data supports)', () => {
    expect(classifyEtaConfidence({ trackingStatus: 'live', hasRealRouteData: false })).toBe('estimated');
  });

  it('pre-trip / not-yet-reporting states -> estimated, never confirmed or inferred', () => {
    expect(classifyEtaConfidence({ trackingStatus: 'not_started', hasRealRouteData: true })).toBe('estimated');
    expect(classifyEtaConfidence({ trackingStatus: 'starting', hasRealRouteData: true })).toBe('estimated');
  });

  it('hard invariant: `confirmed` is only ever reported for a genuinely live feed with real route data — never a proxy for "the app looks confident"', () => {
    const allNonLiveOrFallback = [
      { trackingStatus: 'unavailable', hasRealRouteData: true },
      { trackingStatus: 'stale', hasRealRouteData: true },
      { trackingStatus: 'not_started', hasRealRouteData: true },
      { trackingStatus: 'starting', hasRealRouteData: true },
      { trackingStatus: 'live', hasRealRouteData: false },
    ] as const;
    for (const input of allNonLiveOrFallback) {
      expect(classifyEtaConfidence(input)).not.toBe('confirmed');
    }
  });
});
