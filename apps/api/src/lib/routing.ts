import { getEnv } from '../config/env.js';
import { getLogger } from '../config/logger.js';
import { getRedis } from './redis.js';
import { haversineDistanceMeters } from './geo.js';

const CACHE_TTL_SEC = 3600;
// Short-lived: a fallback estimate shouldn't keep being served for a full
// hour once OSRM comes back online (e.g. someone runs prepare.sh mid-session).
const FALLBACK_CACHE_TTL_SEC = 60;
const FETCH_TIMEOUT_MS = 4000;
// Plausible average includes intersections/traffic — used only for the
// straight-line fallback when OSRM is unavailable, never shown as if it
// came from a real routing engine.
const FALLBACK_AVG_SPEED_M_PER_S = 11; // ~40 km/h

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** Google/OSRM polyline-format encoded geometry, precision 5. */
  polyline: string;
  distanceM: number;
  durationSec: number;
  /** False when this came from the haversine fallback, not real OSRM routing. */
  isEstimate: boolean;
}

interface OsrmRouteResponse {
  code: string;
  routes: Array<{ geometry: string; distance: number; duration: number }>;
}

function fallbackRoute(origin: RoutePoint, destination: RoutePoint): RouteResult {
  const distanceM = haversineDistanceMeters(origin, destination);
  return {
    polyline: '',
    distanceM,
    durationSec: Math.round(distanceM / FALLBACK_AVG_SPEED_M_PER_S),
    isEstimate: true,
  };
}

export async function getRoute(origin: RoutePoint, destination: RoutePoint): Promise<RouteResult> {
  const key = `route:${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}:${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`;
  const redis = getRedis();

  if (redis) {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as RouteResult;
  }

  const env = getEnv();
  const url = `${env.OSRM_URL}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=polyline`;

  let result: RouteResult;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`OSRM responded ${response.status}`);
    const data = (await response.json()) as OsrmRouteResponse;
    const route = data.routes[0];
    if (data.code !== 'Ok' || !route) throw new Error(`OSRM returned no route (${data.code})`);

    result = {
      polyline: route.geometry,
      distanceM: route.distance,
      durationSec: Math.round(route.duration),
      isEstimate: false,
    };
  } catch (err) {
    getLogger().warn(
      { err, origin, destination },
      'OSRM unreachable or failed — falling back to straight-line estimate',
    );
    result = fallbackRoute(origin, destination);
  }

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
