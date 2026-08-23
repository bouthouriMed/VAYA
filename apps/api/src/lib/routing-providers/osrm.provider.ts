import { getEnv } from '../../config/env.js';
import { getLogger } from '../../config/logger.js';
import type { RoutePoint, RouteResult, RoutingProvider } from './routing-provider.types.js';

/**
 * Self-hosted OSRM adapter — Vaya's original, protected routing
 * infrastructure (CLAUDE.md: "the OSRM-based routing foundation... don't
 * replace it without a documented reason"). This refactor's reason is
 * explicit and real (moving to Google Maps Platform as the primary
 * provider), but "primary" is not "only" — this adapter is what keeps OSRM
 * working exactly as before as the automatic fallback whenever no Google
 * key is configured (lib/routing-providers/index.ts), so every environment
 * that hasn't set GOOGLE_MAPS_SERVER_API_KEY yet — this sandbox included —
 * behaves identically to before this change.
 *
 * computeRoute's request logic (URL shape, timeout, error handling) is a
 * direct extraction of the pre-existing lib/routing.ts's getRoute — no
 * behavior change, just relocated behind the same interface the Google
 * adapter satisfies.
 */

const FETCH_TIMEOUT_MS = 4000;

interface OsrmRouteResponse {
  code: string;
  routes: Array<{ geometry: string; distance: number; duration: number }>;
}

interface OsrmTableResponse {
  code: string;
  distances?: number[][];
  durations?: number[][];
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export class OsrmRoutingProvider implements RoutingProvider {
  readonly name = 'osrm' as const;

  async computeRoute(
    origin: RoutePoint,
    destination: RoutePoint,
    waypoints: RoutePoint[] = [],
  ): Promise<RouteResult | null> {
    const allPoints = [origin, ...waypoints, destination];
    const coords = allPoints.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `${getEnv().OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=polyline`;

    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) throw new Error(`OSRM responded ${response.status}`);
      const data = (await response.json()) as OsrmRouteResponse;
      const route = data.routes[0];
      if (data.code !== 'Ok' || !route) throw new Error(`OSRM returned no route (${data.code})`);

      return {
        polyline: route.geometry,
        distanceM: route.distance,
        durationSec: Math.round(route.duration),
        isEstimate: false,
      };
    } catch (err) {
      getLogger().warn({ err, origin, destination }, 'OSRM unreachable or failed');
      return null;
    }
  }

  /** OSRM's `/table` service — origin/destination indices map directly onto
   *  Vaya's RoutingProvider.computeMatrix contract; OSRM computes all
   *  pairs in one call the same way Google's computeRouteMatrix does. */
  async computeMatrix(
    origins: RoutePoint[],
    destinations: RoutePoint[],
  ): Promise<
    Array<{ originIndex: number; destinationIndex: number; distanceM: number; durationSec: number }> | null
  > {
    const allPoints = [...origins, ...destinations];
    const coords = allPoints.map((p) => `${p.lng},${p.lat}`).join(';');
    const sourceIndices = origins.map((_, i) => i).join(';');
    const destIndices = destinations.map((_, i) => origins.length + i).join(';');
    const url =
      `${getEnv().OSRM_URL}/table/v1/driving/${coords}` +
      `?sources=${sourceIndices}&destinations=${destIndices}&annotations=distance,duration`;

    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) throw new Error(`OSRM table responded ${response.status}`);
      const data = (await response.json()) as OsrmTableResponse;
      if (data.code !== 'Ok' || !data.durations || !data.distances) {
        throw new Error(`OSRM table returned no matrix (${data.code})`);
      }

      const results: Array<{
        originIndex: number;
        destinationIndex: number;
        distanceM: number;
        durationSec: number;
      }> = [];
      for (let i = 0; i < origins.length; i++) {
        for (let j = 0; j < destinations.length; j++) {
          const distanceM = data.distances[i]?.[j];
          const durationSec = data.durations[i]?.[j];
          if (distanceM === undefined || durationSec === undefined) continue;
          results.push({ originIndex: i, destinationIndex: j, distanceM, durationSec: Math.round(durationSec) });
        }
      }
      return results;
    } catch (err) {
      getLogger().warn({ err }, 'OSRM table request failed');
      return null;
    }
  }
}
