/**
 * Route Changes During a Trip (spec §29, edge case §51 — matrix M-090,
 * EDGE-051, INV-08). VAYA maintains two distinct route concepts: the
 * **planned route** (as originally published by the driver, the intended and
 * historical journey) and the **live feasible corridor** (what VAYA currently
 * believes the driver can realistically serve, given genuine deviation).
 * INV-08 (hard invariant): `plannedRoute` is never mutated by a deviation, no
 * matter how large — only `liveCorridor` ever changes, and only in response
 * to a genuine (not GPS-noise) deviation.
 *
 * Pure module: no I/O. The caller (live-tracking service) is responsible for
 * computing the raw distance-from-planned-route reading and for persisting
 * the returned state.
 */

export type RouteDeviationClassification = 'on_route' | 'noise' | 'real_deviation';

/**
 * Threshold values (VAYA operational policy — spec §28 "VAYA Operational
 * Policy Configuration") are a first-cut, explicitly not a settled product
 * decision, same category as pricing's `base_rate_per_km`
 * (CLAUDE.md's "Important decisions"). 100m noise floor is roughly
 * GPS-jitter/lane-choice scale; 400m real-deviation ceiling is roughly "took
 * a different road entirely"; the band between the two is a deliberate
 * ambiguous middle ("noise, don't react yet" rather than a forced two-value
 * split).
 */
export const ROUTE_DEVIATION_NOISE_THRESHOLD_METERS = 100;
export const ROUTE_DEVIATION_REAL_THRESHOLD_METERS = 400;

/**
 * Classifies a raw distance-from-planned-route reading into one of three
 * buckets, so ordinary GPS jitter/lane-level noise never gets treated as a
 * real reroute (EDGE-051's "distinguishes noise from real reroute").
 */
export function classifyRouteDeviation(distanceMeters: number): RouteDeviationClassification {
  if (distanceMeters < ROUTE_DEVIATION_NOISE_THRESHOLD_METERS) return 'on_route';
  if (distanceMeters <= ROUTE_DEVIATION_REAL_THRESHOLD_METERS) return 'noise';
  return 'real_deviation';
}

export interface RouteWaypoint {
  lat: number;
  lng: number;
}

export interface RouteShape {
  waypoints: RouteWaypoint[];
}

export interface LiveCorridorState {
  plannedRoute: RouteShape;
  liveCorridor: RouteShape;
}

/**
 * The state-update rule enforcing INV-08: `plannedRoute` is NEVER mutated by
 * a deviation, no matter how large — only `liveCorridor` ever changes, and
 * only on a genuine (`real_deviation`) classification.
 */
export function updateLiveCorridor(
  state: LiveCorridorState,
  classification: RouteDeviationClassification,
  newRemainingRoute: RouteWaypoint[],
): LiveCorridorState {
  if (classification !== 'real_deviation') return state;
  return {
    plannedRoute: state.plannedRoute,
    liveCorridor: { waypoints: newRemainingRoute },
  };
}
