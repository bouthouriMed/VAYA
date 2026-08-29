import { describe, it, expect } from 'vitest';
import {
  classifyRouteDeviation,
  updateLiveCorridor,
  ROUTE_DEVIATION_NOISE_THRESHOLD_METERS,
  ROUTE_DEVIATION_REAL_THRESHOLD_METERS,
} from '../live-corridor';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-090, EDGE-051,
 * INV-08) — spec §29 "Route Changes During a Trip" and §51 "Edge Case:
 * Driver Deviates":
 *
 *   "VAYA maintains two concepts. Planned route: the route originally
 *    published by the driver. Live feasible corridor: the route VAYA
 *    currently believes the driver can realistically serve... The planned
 *    route remains the intended/historical journey. The live corridor
 *    controls real-time matching." / "If actual route differs from planned
 *    route: retain original planned route, update live feasible corridor,
 *    recalculate ETA, recalculate future matching opportunities, preserve
 *    existing passengers, inform affected users when their journey
 *    meaningfully changes."
 *
 * Confirmed 100% missing today (matrix M-090): no live-corridor concept
 * exists anywhere in the codebase — `rides.routeGeometry` (or equivalent)
 * is the only route data, and nothing distinguishes "as published" from
 * "as currently believed feasible". This file specifies two intended pure
 * functions, deliberately NOT implemented yet (RED, Category B):
 *
 *  - `classifyRouteDeviation`: turns a raw distance-from-planned-route
 *    reading into one of three buckets, so ordinary GPS jitter/lane-level
 *    noise never gets treated as a real reroute (EDGE-051's "distinguishes
 *    noise from real reroute").
 *  - `updateLiveCorridor`: the state-update rule enforcing the hard
 *    invariant (INV-08) that `plannedRoute` is NEVER mutated by a
 *    deviation, no matter how large — only `liveCorridor` ever changes, and
 *    only on a genuine (not noise) deviation.
 *
 * Threshold values are a first-cut, explicitly not a settled product
 * decision (same category as pricing's `base_rate_per_km` — see
 * CLAUDE.md's "Important decisions"): 100m noise floor is roughly
 * GPS-jitter/lane-choice scale, 400m real-deviation ceiling is roughly
 * "took a different road entirely", with a deliberate ambiguous middle band
 * that a real implementation may want to treat as "noise, don't react yet"
 * rather than forcing a two-value classification.
 */

describe('classifyRouteDeviation — noise vs. real deviation (EDGE-051)', () => {
  it('a small distance well under the noise threshold is on_route', () => {
    expect(classifyRouteDeviation(10)).toBe('on_route');
    expect(classifyRouteDeviation(ROUTE_DEVIATION_NOISE_THRESHOLD_METERS - 1)).toBe('on_route');
  });

  it('a mid-range distance (GPS jitter / minor lane noise) is classified as noise, not a real deviation', () => {
    const midpoint = (ROUTE_DEVIATION_NOISE_THRESHOLD_METERS + ROUTE_DEVIATION_REAL_THRESHOLD_METERS) / 2;
    expect(classifyRouteDeviation(midpoint)).toBe('noise');
  });

  it('a large distance beyond the real-deviation threshold is a real_deviation', () => {
    expect(classifyRouteDeviation(ROUTE_DEVIATION_REAL_THRESHOLD_METERS + 1)).toBe('real_deviation');
  });
});

describe('updateLiveCorridor — planned route is immutable, live corridor updates only on real deviation (M-090, INV-08)', () => {
  const plannedRoute = { waypoints: [{ lat: 41.6488, lng: -0.8891 }, { lat: 41.3851, lng: 2.1734 }] };
  const initialState = { plannedRoute, liveCorridor: plannedRoute };
  const newRemainingRoute = [{ lat: 41.7, lng: -0.5 }, { lat: 41.3851, lng: 2.1734 }];

  it('EDGE-051: a "noise" classification changes nothing — neither plannedRoute nor liveCorridor update', () => {
    const next = updateLiveCorridor(initialState, 'noise', newRemainingRoute);
    expect(next.plannedRoute).toBe(initialState.plannedRoute);
    expect(next.liveCorridor).toBe(initialState.liveCorridor);
  });

  it('a "real_deviation" classification updates liveCorridor but never plannedRoute', () => {
    const next = updateLiveCorridor(initialState, 'real_deviation', newRemainingRoute);
    expect(next.plannedRoute).toBe(initialState.plannedRoute); // same reference — untouched
    expect(next.liveCorridor).not.toBe(initialState.liveCorridor);
    expect(next.liveCorridor.waypoints).toEqual(newRemainingRoute);
  });

  it('INV-08 (hard invariant): plannedRoute survives multiple successive real deviations completely unchanged', () => {
    const afterFirst = updateLiveCorridor(initialState, 'real_deviation', newRemainingRoute);
    const afterSecond = updateLiveCorridor(afterFirst, 'real_deviation', [{ lat: 40.0, lng: 0.0 }]);
    expect(afterSecond.plannedRoute).toBe(plannedRoute);
    expect(afterSecond.plannedRoute.waypoints).toEqual(plannedRoute.waypoints);
  });

  it('an "on_route" classification changes nothing, same as noise', () => {
    const next = updateLiveCorridor(initialState, 'on_route', newRemainingRoute);
    expect(next.plannedRoute).toBe(initialState.plannedRoute);
    expect(next.liveCorridor).toBe(initialState.liveCorridor);
  });
});
