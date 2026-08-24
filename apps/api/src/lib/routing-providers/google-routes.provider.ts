import { getLogger } from '../../config/logger.js';
import type {
  RouteAlternative,
  RouteOptionKind,
  RoutePoint,
  RouteResult,
  RoutingProvider,
} from './routing-provider.types.js';

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
// Route-alternatives requests additionally ask for toll presence — only on
// the primary (fastest + algorithmic alternates) request, since the
// avoid-tolls/avoid-highways requests below already know their own toll
// status from the modifier they asked for, without needing to pay for the
// field a second time.
const COMPUTE_ROUTES_WITH_TOLLS_FIELD_MASK = `${COMPUTE_ROUTES_FIELD_MASK},routes.travelAdvisory.tollInfo`;

function toLatLng(point: RoutePoint) {
  return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
}

function parseDurationSeconds(duration: string | undefined): number {
  // Routes API returns duration as a string like "930s".
  if (!duration) return 0;
  return Math.round(Number.parseFloat(duration.replace('s', '')));
}

type RouteResultWithTolls = RouteResult & { hasTolls?: boolean };

interface ComputeRoutesResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
    travelAdvisory?: { tollInfo?: unknown };
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

  /** Shared computeRoutes call used by both `computeRoute` and
   *  `computeRouteAlternatives` — returns every route Google's response
   *  contains (not just the first), with toll presence when the caller
   *  asked for the tolls-inclusive field mask. Never throws; a failed
   *  request resolves to null, matching every other provider method's
   *  contract. */
  private async requestRoutes(
    origin: RoutePoint,
    destination: RoutePoint,
    waypoints: RoutePoint[],
    options: {
      computeAlternativeRoutes?: boolean;
      routeModifiers?: { avoidTolls?: boolean; avoidHighways?: boolean };
      withTollInfo?: boolean;
    },
  ): Promise<RouteResultWithTolls[] | null> {
    try {
      const response = await fetchWithTimeout(COMPUTE_ROUTES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': options.withTollInfo
            ? COMPUTE_ROUTES_WITH_TOLLS_FIELD_MASK
            : COMPUTE_ROUTES_FIELD_MASK,
        },
        body: JSON.stringify({
          origin: toLatLng(origin),
          destination: toLatLng(destination),
          intermediates: waypoints.map(toLatLng),
          travelMode: 'DRIVE',
          polylineEncoding: 'ENCODED_POLYLINE',
          computeAlternativeRoutes: options.computeAlternativeRoutes ?? false,
          ...(options.routeModifiers ? { routeModifiers: options.routeModifiers } : {}),
        }),
      });
      if (!response.ok) throw new Error(`Routes API responded ${response.status}`);
      const data = (await response.json()) as ComputeRoutesResponse;
      const routes = (data.routes ?? []).filter((r) => r.polyline?.encodedPolyline);
      if (routes.length === 0) return null;

      return routes.map((route) => ({
        polyline: route.polyline!.encodedPolyline!,
        distanceM: route.distanceMeters ?? 0,
        durationSec: parseDurationSeconds(route.duration),
        isEstimate: false,
        hasTolls: route.travelAdvisory?.tollInfo ? true : undefined,
      }));
    } catch (err) {
      getLogger().warn({ err, provider: 'google', options }, 'Routes API computeRoutes failed');
      return null;
    }
  }

  /**
   * World-class route-selection UX (rides/route-options.service.ts) needs
   * genuinely distinct options, not just whatever Google's own
   * alternate-route algorithm happens to surface — so this fires up to
   * three requests in parallel: the default (fastest + up to 2 algorithmic
   * alternates, with toll info), an explicit avoid-tolls request, and an
   * explicit avoid-highways request. A modifier's result is only kept when
   * its geometry actually differs from every option already collected —
   * offering a duplicate "avoid tolls" option that's pixel-identical to the
   * fastest route (because there was never a toll on it to begin with)
   * would be worse UX than not offering it at all.
   */
  async computeRouteAlternatives(
    origin: RoutePoint,
    destination: RoutePoint,
    waypoints: RoutePoint[] = [],
  ): Promise<RouteAlternative[] | null> {
    const [primary, noTolls, noHighways] = await Promise.all([
      this.requestRoutes(origin, destination, waypoints, {
        computeAlternativeRoutes: true,
        withTollInfo: true,
      }),
      this.requestRoutes(origin, destination, waypoints, { routeModifiers: { avoidTolls: true } }),
      this.requestRoutes(origin, destination, waypoints, { routeModifiers: { avoidHighways: true } }),
    ]);
    if (!primary || primary.length === 0) return null;

    const seenPolylines = new Set<string>();
    const options: RouteAlternative[] = [];

    const push = (route: RouteResultWithTolls, kind: RouteOptionKind): void => {
      if (seenPolylines.has(route.polyline)) return;
      seenPolylines.add(route.polyline);
      options.push({
        polyline: route.polyline,
        distanceM: route.distanceM,
        durationSec: route.durationSec,
        isEstimate: route.isEstimate,
        kind,
        hasTolls: route.hasTolls ?? null,
      });
    };

    primary.forEach((route, index) => push(route, index === 0 ? 'fastest' : 'alternative'));
    const noTollsRoute = noTolls?.[0];
    if (noTollsRoute) push({ ...noTollsRoute, hasTolls: false }, 'no_tolls');
    const noHighwaysRoute = noHighways?.[0];
    if (noHighwaysRoute) push(noHighwaysRoute, 'no_highways');

    return options;
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
