export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** Google/OSRM polyline-format encoded geometry, precision 5 — both
   *  providers emit this exact same format, so lib/polyline.ts's
   *  decodePolyline works unchanged regardless of which one produced it. */
  polyline: string;
  distanceM: number;
  durationSec: number;
  /** False when this came from a real routing provider; true only for the
   *  haversine straight-line fallback (lib/routing.ts's fallbackRoute). */
  isEstimate: boolean;
}

/** What kind of route this alternative represents — drives the label a
 *  driver sees on the route-selection step (rides/route-options.service.ts)
 *  and, for `no_tolls`/`no_highways`, was explicitly requested via a route
 *  modifier rather than merely being whatever a provider's alternate-route
 *  algorithm happened to surface. */
export type RouteOptionKind = 'fastest' | 'no_tolls' | 'no_highways' | 'alternative';

export interface RouteAlternative extends RouteResult {
  kind: RouteOptionKind;
  /** Whether this route carries tolls — `false` when it was computed with
   *  tolls explicitly avoided, `null` when the provider has no toll data to
   *  report (always the case for the OSRM adapter, and for Google whenever
   *  this deployment's field mask/billing doesn't surface toll info). Never
   *  fabricated when unknown. */
  hasTolls: boolean | null;
}

/**
 * RoutingProvider abstraction (mirrors LocationProvider in
 * modules/geocoding/providers/ exactly) — every routing call in this
 * codebase goes through lib/routing.ts's existing function signatures
 * (getRoute/getRouteWithSpeedProfile/nearestRoad), which now delegate to
 * whichever provider is active here. matching.service.ts, rides.service.ts,
 * and stop-candidates.service.ts never import a provider class directly.
 */
export interface RoutingProvider {
  readonly name: 'google' | 'osrm';

  /** A single route, optionally through intermediate waypoints (in visit
   *  order, between origin and destination) — the primitive both a normal
   *  ride's route AND a detour-insertion calculation ("origin -> pickup ->
   *  dropoff -> destination") use identically, just with a different
   *  waypoints array. */
  computeRoute(
    origin: RoutePoint,
    destination: RoutePoint,
    waypoints?: RoutePoint[],
  ): Promise<RouteResult | null>;

  /** Batch travel-time/distance lookup for many origin/destination pairs at
   *  once — the brief's explicit "use Route Matrix selectively, never call
   *  it blindly for every result" case: ranking several already-narrowed
   *  candidate rides' pickup stops against one rider point in a single
   *  call instead of N separate computeRoute calls. */
  computeMatrix(
    origins: RoutePoint[],
    destinations: RoutePoint[],
  ): Promise<Array<{ originIndex: number; destinationIndex: number; distanceM: number; durationSec: number }> | null>;

  /** Route-selection step (rides/route-options.service.ts): computes a
   *  small set of genuinely distinct route alternatives between origin and
   *  destination — the fastest route plus, where the provider actually
   *  supports it, an explicit toll-avoiding and a highway-avoiding
   *  alternative — instead of only ever returning one route. Returns null
   *  (never throws) when the provider is unreachable, exactly like
   *  `computeRoute`; an empty array is a valid "no route found" result,
   *  distinct from "couldn't ask the provider at all". */
  computeRouteAlternatives(
    origin: RoutePoint,
    destination: RoutePoint,
    waypoints?: RoutePoint[],
  ): Promise<RouteAlternative[] | null>;
}
