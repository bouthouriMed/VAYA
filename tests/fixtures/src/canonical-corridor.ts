/**
 * Canonical test world for the VAYA journey-contract suite
 * (docs/tdd_journey_test_matrix.md, docs/unified_driver_and_passenger_journey.md).
 *
 * A realistic long-haul corridor — Madrid -> Zaragoza -> Lleida -> Barcelona,
 * following the real AP-2 highway alignment closely enough that projection/
 * overlap/detour tests exercise genuine route geometry rather than a
 * straight-line proxy. Distances are realistic (~640km/~6h15m total),
 * intentionally non-collinear (the route bends through Calatayud and Fraga),
 * so "is this point near the route" tests can't be satisfied by naive
 * bounding-box math.
 *
 * This module has zero dependency on VAYA production code — it is pure,
 * deterministic geographic data plus small pure helpers, safe to import from
 * packages/domain tests, apps/api integration tests, and tests/e2e alike.
 */

export interface RoutePoint {
  readonly lat: number;
  readonly lng: number;
}

export interface RouteWaypoint extends RoutePoint {
  readonly label: string;
  /** Cumulative road distance from the route's origin, in kilometers. */
  readonly cumulativeKm: number;
}

// -- Named cities -----------------------------------------------------------

export const MADRID: RoutePoint = { lat: 40.4168, lng: -3.7038 };
export const ZARAGOZA: RoutePoint = { lat: 41.6488, lng: -0.8891 };
export const LLEIDA: RoutePoint = { lat: 41.6176, lng: 0.62 };
export const BARCELONA: RoutePoint = { lat: 41.3851, lng: 2.1734 };

/** Off-corridor city used only for free-text place-search fixtures (§3.1). */
export const TORTOSA: RoutePoint = { lat: 40.8126, lng: 0.5211 };

// -- The canonical Madrid -> Barcelona route polyline ------------------------
//
// Real AP-2/A-2 waypoints, not a straight-line interpolation. Segment
// distances are realistic road distances (not haversine), which is exactly
// why the route "bends" — Calatayud and Fraga sit off the direct
// Madrid-Barcelona great circle.

export const CANONICAL_ROUTE_WAYPOINTS: readonly RouteWaypoint[] = [
  { label: 'Madrid', lat: 40.4168, lng: -3.7038, cumulativeKm: 0 },
  { label: 'Guadalajara', lat: 40.6333, lng: -3.1667, cumulativeKm: 62 },
  { label: 'Alcolea del Pinar', lat: 41.0, lng: -2.47, cumulativeKm: 138 },
  { label: 'Calatayud', lat: 41.3527, lng: -1.6428, cumulativeKm: 206 },
  { label: 'La Almunia de Doña Godina', lat: 41.4667, lng: -1.3667, cumulativeKm: 235 },
  { label: 'Zaragoza', lat: 41.6488, lng: -0.8891, cumulativeKm: 325 },
  { label: 'Fraga', lat: 41.5225, lng: 0.345, cumulativeKm: 400 },
  { label: 'Lleida', lat: 41.6176, lng: 0.62, cumulativeKm: 475 },
  { label: 'Igualada', lat: 41.5793, lng: 1.6178, cumulativeKm: 570 },
  { label: 'Martorell', lat: 41.474, lng: 1.9306, cumulativeKm: 610 },
  { label: 'Barcelona', lat: 41.3851, lng: 2.1734, cumulativeKm: 640 },
] as const;

export const CANONICAL_ROUTE_TOTAL_KM = 640;

/** Average corridor speed used to derive deterministic durations from distance. */
export const CANONICAL_ROUTE_AVG_KMH = 100;

export function kmToDurationMinutes(km: number, avgKmh = CANONICAL_ROUTE_AVG_KMH): number {
  return Math.round((km / avgKmh) * 60);
}

/**
 * Cumulative distance (km from Madrid) of a named waypoint on the canonical
 * route. Throws if the label isn't one of CANONICAL_ROUTE_WAYPOINTS — tests
 * should use this rather than hand-copying magic numbers.
 */
export function cumulativeKmOf(label: string): number {
  const wp = CANONICAL_ROUTE_WAYPOINTS.find((w) => w.label === label);
  if (!wp) throw new Error(`Unknown canonical waypoint: ${label}`);
  return wp.cumulativeKm;
}

/**
 * Distance/duration between two cumulative-km positions along the canonical
 * route (i.e. a segment's real road distance, not haversine as-the-crow-flies).
 * Negative if `toKm < fromKm` (caller's problem — most tests want to assert
 * ordering explicitly rather than have this silently clamp).
 */
export function segmentDistanceKm(fromKm: number, toKm: number): number {
  return toKm - fromKm;
}

export function segmentDurationMinutes(fromKm: number, toKm: number): number {
  return kmToDurationMinutes(segmentDistanceKm(fromKm, toKm));
}

/**
 * A dense polyline (lat/lng pairs only, no metadata) suitable for feeding to
 * a real or fake routing/projection function that expects a raw coordinate
 * array. Linearly interpolates 3 extra points between each named waypoint so
 * projection tests have enough resolution to distinguish "on the corridor"
 * from "well off the corridor" without relying on the sparse named points
 * alone.
 */
export function denseCanonicalPolyline(): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (let i = 0; i < CANONICAL_ROUTE_WAYPOINTS.length - 1; i++) {
    const a = CANONICAL_ROUTE_WAYPOINTS[i]!;
    const b = CANONICAL_ROUTE_WAYPOINTS[i + 1]!;
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      points.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  points.push(CANONICAL_ROUTE_WAYPOINTS[CANONICAL_ROUTE_WAYPOINTS.length - 1]!);
  return points;
}

/**
 * A point meaningfully off the corridor (used for "not near the route"
 * fixtures) — Huesca, ~50km north of the Zaragoza-Fraga leg.
 */
export const OFF_CORRIDOR_POINT: RoutePoint = { lat: 42.1401, lng: -0.4089 };

// -- Convenience segment shortcuts used throughout the test matrix ----------

export const KM = {
  madrid: cumulativeKmOf('Madrid'),
  zaragoza: cumulativeKmOf('Zaragoza'),
  lleida: cumulativeKmOf('Lleida'),
  barcelona: cumulativeKmOf('Barcelona'),
  /** A point on the corridor strictly between Zaragoza and Lleida, used for "driver has passed Zaragoza but not Lleida" scenarios. */
  betweenZaragozaAndLleida: cumulativeKmOf('Zaragoza') + (cumulativeKmOf('Lleida') - cumulativeKmOf('Zaragoza')) / 2,
  /** A point strictly between Madrid and Zaragoza. */
  betweenMadridAndZaragoza: cumulativeKmOf('Madrid') + (cumulativeKmOf('Zaragoza') - cumulativeKmOf('Madrid')) / 2,
} as const;
