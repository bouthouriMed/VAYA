import { getLogger } from '../../config/logger.js';
import type { RoutePoint, RouteResult, RoutingProvider } from './routing-provider.types.js';

/**
 * Google Routes API adapter — the primary RoutingProvider once
 * GOOGLE_MAPS_SERVER_API_KEY is configured (lib/routing-providers/index.ts).
 *
 * Same verification caveat as the Places adapter (modules/geocoding/
 * providers/google-places.provider.ts): written directly against Google's
 * current, documented Routes API contract, not exercised against a live
 * endpoint in this sandboxed environment (proxy blocks external hosts
 * outside a fixed allowlist; no real API key was provided, per this task's
 * explicit instruction not to ask for one before implementing).
 */

const COMPUTE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const COMPUTE_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const FETCH_TIMEOUT_MS = 5000;

// Minimal field masks — Routes API bills by which fields you request, same
// cost-discipline reasoning as the Places field masks (brief §23).
const COMPUTE_ROUTES_FIELD_MASK = 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline';
const COMPUTE_MATRIX_FIELD_MASK =
  'originIndex,destinationIndex,distanceMeters,duration,condition';

function toLatLng(point: RoutePoint) {
  return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
}

function parseDurationSeconds(duration: string | undefined): number {
  // Routes API returns duration as a string like "930s".
  if (!duration) return 0;
  return Math.round(Number.parseFloat(duration.replace('s', '')));
}

interface ComputeRoutesResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
  }>;
}

interface ComputeMatrixRow {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export class GoogleRoutesProvider implements RoutingProvider {
  readonly name = 'google' as const;

  constructor(private readonly apiKey: string) {}

  async computeRoute(
    origin: RoutePoint,
    destination: RoutePoint,
    waypoints: RoutePoint[] = [],
  ): Promise<RouteResult | null> {
    try {
      const response = await fetchWithTimeout(COMPUTE_ROUTES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': COMPUTE_ROUTES_FIELD_MASK,
        },
        body: JSON.stringify({
          origin: toLatLng(origin),
          destination: toLatLng(destination),
          intermediates: waypoints.map(toLatLng),
          travelMode: 'DRIVE',
          polylineEncoding: 'ENCODED_POLYLINE',
        }),
      });
      if (!response.ok) throw new Error(`Routes API responded ${response.status}`);
      const data = (await response.json()) as ComputeRoutesResponse;
      const route = data.routes?.[0];
      if (!route?.polyline?.encodedPolyline) return null;

      return {
        polyline: route.polyline.encodedPolyline,
        distanceM: route.distanceMeters ?? 0,
        durationSec: parseDurationSeconds(route.duration),
        isEstimate: false,
      };
    } catch (err) {
      getLogger().warn({ err, provider: 'google' }, 'Routes API computeRoutes failed');
      return null;
    }
  }

  async computeMatrix(
    origins: RoutePoint[],
    destinations: RoutePoint[],
  ): Promise<
    Array<{ originIndex: number; destinationIndex: number; distanceM: number; durationSec: number }> | null
  > {
    try {
      const response = await fetchWithTimeout(COMPUTE_MATRIX_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': COMPUTE_MATRIX_FIELD_MASK,
        },
        body: JSON.stringify({
          origins: origins.map((o) => ({ waypoint: toLatLng(o) })),
          destinations: destinations.map((d) => ({ waypoint: toLatLng(d) })),
          travelMode: 'DRIVE',
        }),
      });
      if (!response.ok) throw new Error(`Routes API computeRouteMatrix responded ${response.status}`);
      // computeRouteMatrix streams a JSON array of per-pair results.
      const rows = (await response.json()) as ComputeMatrixRow[];
      return rows
        .filter((r) => r.condition !== 'ROUTE_NOT_FOUND' && r.originIndex !== undefined)
        .map((r) => ({
          originIndex: r.originIndex ?? 0,
          destinationIndex: r.destinationIndex ?? 0,
          distanceM: r.distanceMeters ?? 0,
          durationSec: parseDurationSeconds(r.duration),
        }));
    } catch (err) {
      getLogger().warn({ err, provider: 'google' }, 'Routes API computeRouteMatrix failed');
      return null;
    }
  }
}
