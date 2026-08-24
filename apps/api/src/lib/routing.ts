import { getEnv } from '../config/env.js';
import { getLogger } from '../config/logger.js';
import { getRedis } from './redis.js';
import { haversineDistanceMeters } from './geo.js';
import { decodePolyline } from './polyline.js';
import {
  getRoutingProvider,
  type RouteAlternative,
  type RoutePoint,
  type RouteResult,
} from './routing-providers/index.js';

// Re-exported so every existing call site (matching.service.ts,
// rides.service.ts, stop-candidates.service.ts) keeps importing these types
// from lib/routing.js unchanged — the canonical definition now lives in
// lib/routing-providers/routing-provider.types.ts, shared by both provider
// adapters and this file.
export type { RoutePoint, RouteResult, RouteAlternative };

const CACHE_TTL_SEC = 3600;
// Short-lived: a fallback estimate shouldn't keep being served for a full
// hour once OSRM comes back online (e.g. someone runs prepare.sh mid-session).
const FALLBACK_CACHE_TTL_SEC = 60;
const FETCH_TIMEOUT_MS = 4000;
// Plausible average includes intersections/traffic — used only for the
// straight-line fallback when OSRM is unavailable, never shown as if it
// came from a real routing engine.
const FALLBACK_AVG_SPEED_M_PER_S = 11; // ~40 km/h

export interface NearestRoadResult {
  lat: number;
  lng: number;
  /** OSRM way name at the snapped point — empty string when OSM has no name
   *  tag there (common for both motorways and minor tracks in this
   *  extract, so an empty name alone is not a reliable class signal — see
   *  stop-candidates.service.ts). */
  name: string;
  /** Distance in meters from the query point to the snapped road point. */
  snapDistanceM: number;
}

interface OsrmNearestResponse {
  code: string;
  waypoints?: Array<{ location: [number, number]; name: string; distance: number }>;
}

/** Snaps a point to the nearest drivable road segment via OSRM's `nearest`
 *  service. Returns null (never throws) when OSRM is unreachable or finds
 *  no match — callers treat that as "this sample doesn't yield a viable
 *  stop", not a hard failure of the whole generation run. */
export async function nearestRoad(point: RoutePoint): Promise<NearestRoadResult | null> {
  const env = getEnv();
  const url = `${env.OSRM_URL}/nearest/v1/driving/${point.lng},${point.lat}?number=1`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`OSRM nearest responded ${response.status}`);
    const data = (await response.json()) as OsrmNearestResponse;
    const waypoint = data.waypoints?.[0];
    if (data.code !== 'Ok' || !waypoint) throw new Error(`OSRM nearest returned no match (${data.code})`);

    return {
      lat: waypoint.location[1],
      lng: waypoint.location[0],
      name: waypoint.name ?? '',
      snapDistanceM: waypoint.distance,
    };
  } catch (err) {
    getLogger().warn({ err, point }, 'OSRM nearest unreachable or failed for this sample');
    return null;
  }
}

export interface AnnotatedRoute {
  /** Full-resolution route geometry, decoded. */
  points: RoutePoint[];
  /** One entry per segment (points[i] -> points[i+1]) — local travel speed
   *  in m/s, from OSRM's route annotations. Used as a proxy for road
   *  classification: this OSRM deployment's `nearest`/`route` responses
   *  carry no direct way-class tag (verified against the live Tunisia
   *  extract — no `classes` field in either service's output), but a
   *  sustained high local speed is still a real, available signal that a
   *  segment is a limited-access/motorway-grade road. */
  segmentSpeedsMPerS: number[];
  distanceM: number;
  durationSec: number;
}

interface OsrmAnnotatedRouteResponse {
  code: string;
  routes: Array<{
    geometry: string;
    distance: number;
    duration: number;
    legs: Array<{ annotation?: { distance: number[]; duration: number[] } }>;
  }>;
}

/** Like `getRoute`, but requests per-segment annotations so callers can
 *  derive a local speed profile along the route. No haversine fallback —
 *  a straight line has no road geometry or speed profile to derive
 *  anything from, so this returns null when OSRM is unavailable and
 *  callers must skip stop-candidate generation entirely rather than
 *  fabricate candidates from a fallback line. Not cached: callers
 *  (stop-candidates.service.ts) cache the derived candidate list itself,
 *  keyed by polyline hash, which is the expensive/reusable artifact. */
export async function getRouteWithSpeedProfile(
  origin: RoutePoint,
  destination: RoutePoint,
): Promise<AnnotatedRoute | null> {
  const env = getEnv();
  const url =
    `${env.OSRM_URL}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
    `?overview=full&geometries=polyline&annotations=true`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`OSRM responded ${response.status}`);
    const data = (await response.json()) as OsrmAnnotatedRouteResponse;
    const route = data.routes[0];
    if (data.code !== 'Ok' || !route) throw new Error(`OSRM returned no route (${data.code})`);

    const decoded = decodePolyline(route.geometry);
    const segmentDistances = route.legs.flatMap((leg) => leg.annotation?.distance ?? []);
    const segmentDurations = route.legs.flatMap((leg) => leg.annotation?.duration ?? []);
    const segmentSpeedsMPerS = segmentDistances.map((d, i) => {
      const dur = segmentDurations[i];
      return dur && dur > 0 ? d / dur : 0;
    });

    return {
      points: decoded,
      segmentSpeedsMPerS,
      distanceM: route.distance,
      durationSec: Math.round(route.duration),
    };
  } catch (err) {
    getLogger().warn(
      { err, origin, destination },
      'OSRM unreachable or failed while fetching annotated route — stop-candidate generation will be skipped',
    );
    return null;
  }
}

/** Straight-line estimate when no routing provider is reachable — sums
 *  consecutive-leg haversine distances so a multi-waypoint request (a
 *  detour-insertion calculation, e.g.) still degrades to a sane, if
 *  approximate, total rather than only handling the plain origin-
 *  destination case. Never shown as if it came from a real routing engine
 *  (isEstimate: true) — matches this function's pre-existing contract. */
function fallbackRoute(points: RoutePoint[]): RouteResult {
  let distanceM = 0;
  for (let i = 0; i < points.length - 1; i++) {
    distanceM += haversineDistanceMeters(points[i]!, points[i + 1]!);
  }
  return {
    polyline: '',
    distanceM,
    durationSec: Math.round(distanceM / FALLBACK_AVG_SPEED_M_PER_S),
    isEstimate: true,
  };
}

/**
 * Computes a route via the active RoutingProvider (Google Routes when
 * GOOGLE_MAPS_SERVER_API_KEY is configured, self-hosted OSRM otherwise —
 * lib/routing-providers/index.ts) with a straight-line haversine fallback
 * when the provider is unreachable, cached in Redis exactly as before this
 * refactor (same TTLs, same isEstimate-gated short TTL for a fallback
 * result). `waypoints`, when given, are visited in order between origin and
 * destination — the primitive a future detour-insertion calculation
 * ("current position -> pickup -> dropoff -> destination") reuses directly
 * rather than needing a second routing function.
 */
export async function getRoute(
  origin: RoutePoint,
  destination: RoutePoint,
  waypoints: RoutePoint[] = [],
): Promise<RouteResult> {
  const waypointKey = waypoints.map((w) => `${w.lat.toFixed(5)},${w.lng.toFixed(5)}`).join(';');
  const key =
    `route:${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}:${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}` +
    (waypointKey ? `:via:${waypointKey}` : '');
  const redis = getRedis();

  if (redis) {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as RouteResult;
  }

  const result =
    (await getRoutingProvider().computeRoute(origin, destination, waypoints)) ??
    fallbackRoute([origin, ...waypoints, destination]);

  if (redis) {
    await redis.set(
      key,
      JSON.stringify(result),
      'EX',
      result.isEstimate ? FALLBACK_CACHE_TTL_SEC : CACHE_TTL_SEC,
    );
  }
  return result;
}

// Shorter-lived than a single route's cache: alternatives are requested
// once per route-selection step (not on every render the way a single
// route is), so there's less value in holding them a full hour, and a
// shorter TTL means a provider outage's fallback single-option result
// doesn't get stuck being served for long once the provider recovers.
const ALTERNATIVES_CACHE_TTL_SEC = 600;
const ALTERNATIVES_FALLBACK_CACHE_TTL_SEC = 60;

/**
 * Computes a small set of genuinely distinct route alternatives (fastest,
 * and — where the active provider supports it — an explicit toll-avoiding
 * and highway-avoiding option) via the active RoutingProvider, Redis-cached
 * by coordinate pair exactly like `getRoute`. Falls back to a single
 * haversine-estimate "route" (marked `isEstimate: true`, `kind: 'fastest'`)
 * when the provider is unreachable or returns nothing — the route-selection
 * step always has at least one option to fall back to, it just isn't a
 * meaningful *choice* in that case (rides/route-options.service.ts's caller
 * decides whether showing a single-option step is worth it at all).
 */
export async function getRouteAlternatives(
  origin: RoutePoint,
  destination: RoutePoint,
  waypoints: RoutePoint[] = [],
): Promise<RouteAlternative[]> {
  const waypointKey = waypoints.map((w) => `${w.lat.toFixed(5)},${w.lng.toFixed(5)}`).join(';');
  const key =
    `route-alts:${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}:${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}` +
    (waypointKey ? `:via:${waypointKey}` : '');
  const redis = getRedis();

  if (redis) {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as RouteAlternative[];
  }

  const provided = await getRoutingProvider().computeRouteAlternatives(origin, destination, waypoints);
  const result: RouteAlternative[] =
    provided && provided.length > 0
      ? provided
      : [{ ...fallbackRoute([origin, ...waypoints, destination]), kind: 'fastest', hasTolls: null }];

  if (redis) {
    const anyEstimate = result.some((r) => r.isEstimate);
    await redis.set(
      key,
      JSON.stringify(result),
      'EX',
      anyEstimate ? ALTERNATIVES_FALLBACK_CACHE_TTL_SEC : ALTERNATIVES_CACHE_TTL_SEC,
    );
  }
  return result;
}
