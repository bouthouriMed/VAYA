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
}
