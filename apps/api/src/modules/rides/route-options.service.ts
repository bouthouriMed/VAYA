import { randomUUID } from 'node:crypto';
import { getRedis } from '../../lib/redis.js';
import { getRouteAlternatives, type RoutePoint } from '../../lib/routing.js';
import type { RouteOptionKind } from '../../lib/routing-providers/index.js';

/**
 * Route-selection step (the new step inserted between the ride-creation
 * form and pickup/dropoff selection in apps/mobile's publish wizard):
 * fetches a small set of real, distinct route alternatives so the driver
 * picks which road their ride actually takes — fastest, toll-avoiding,
 * highway-avoiding, or an algorithmic alternate — before candidate stops
 * are generated against it.
 *
 * `getRouteOptions` is stateless from the caller's point of view (no ride
 * needs to exist yet — origin/destination alone are enough), but each
 * option is minted with a short-lived, one-shot Redis token. This is the
 * mechanism that keeps `createRide` server-authoritative for pricing
 * (CLAUDE.md: "any endpoint accepting a client-adjustable value that
 * affects marketplace integrity... must enforce bounds server-side"): the
 * client only ever sends back an opaque token, never a distance/duration/
 * geometry value it could otherwise forge to manipulate the bounded price
 * `computeSuggestedPrice` derives from the route. `redeemRouteToken` looks
 * up what the server itself computed moments earlier.
 */

const ROUTE_TOKEN_TTL_SEC = 15 * 60;

const ROUTE_OPTION_LABELS: Record<RouteOptionKind, string> = {
  fastest: 'Le plus rapide',
  no_tolls: 'Éviter les péages',
  no_highways: 'Éviter les autoroutes',
  alternative: 'Itinéraire alternatif',
};

export interface RouteOption {
  token: string;
  kind: RouteOptionKind;
  label: string;
  distanceM: number;
  durationSec: number;
  polyline: string;
  isEstimate: boolean;
  hasTolls: boolean | null;
  /** Exactly one option per response is `recommended: true` — the option
   *  the client should pre-select rather than leaving the driver to choose
   *  with nothing highlighted. */
  recommended: boolean;
}

export interface RouteOptionsResult {
  options: RouteOption[];
}

interface CachedRouteToken {
  origin: RoutePoint;
  destination: RoutePoint;
  kind: RouteOptionKind;
  distanceM: number;
  durationSec: number;
  polyline: string;
  isEstimate: boolean;
}

function routeTokenKey(token: string): string {
  return `route-option:${token}`;
}

/** Coordinates are compared at ~11m precision (4 decimal places) — enough
 *  to reject a token minted for a materially different origin/destination
 *  while tolerating float round-tripping through JSON. */
function sameCoordinate(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-4;
}

export async function getRouteOptions(
  origin: RoutePoint,
  destination: RoutePoint,
): Promise<RouteOptionsResult> {
  const alternatives = await getRouteAlternatives(origin, destination);
  const redis = getRedis();

  const options: RouteOption[] = await Promise.all(
    alternatives.map(async (alt, index) => {
      const token = randomUUID();
      if (redis) {
        const cached: CachedRouteToken = {
          origin,
          destination,
          kind: alt.kind,
          distanceM: alt.distanceM,
          durationSec: alt.durationSec,
          polyline: alt.polyline,
          isEstimate: alt.isEstimate,
        };
        await redis.set(routeTokenKey(token), JSON.stringify(cached), 'EX', ROUTE_TOKEN_TTL_SEC);
      }
      return {
        token,
        kind: alt.kind,
        label: ROUTE_OPTION_LABELS[alt.kind],
        distanceM: alt.distanceM,
        durationSec: alt.durationSec,
        polyline: alt.polyline,
        isEstimate: alt.isEstimate,
        hasTolls: alt.hasTolls,
        recommended: index === 0,
      };
    }),
  );

  return { options };
}

/**
 * Redeems a route token minted by `getRouteOptions`. Returns null on a
 * missing/expired/mismatched token — Redis unavailable, the token typo'd,
 * more than 15 minutes old, or minted for a different origin/destination
 * (guards against replaying a stale token after the driver edited the
 * route) — so `createRide` can fall back to computing the default route
 * fresh, exactly as it did before this feature existed, never blocking ride
 * creation on a route-selection token going stale.
 *
 * One-shot: the token is deleted immediately after a successful redeem, so
 * it can't be replayed across multiple ride-creation attempts — a retried
 * `createRide` call after this one degrades gracefully to the same
 * fallback as any other missing token, not an error.
 */
export async function redeemRouteToken(
  token: string,
  expectedOrigin: RoutePoint,
  expectedDestination: RoutePoint,
): Promise<CachedRouteToken | null> {
  const redis = getRedis();
  if (!redis) return null;

  const raw = await redis.get(routeTokenKey(token));
  if (!raw) return null;

  const cached = JSON.parse(raw) as CachedRouteToken;
  const originMatches =
    sameCoordinate(cached.origin.lat, expectedOrigin.lat) &&
    sameCoordinate(cached.origin.lng, expectedOrigin.lng);
  const destinationMatches =
    sameCoordinate(cached.destination.lat, expectedDestination.lat) &&
    sameCoordinate(cached.destination.lng, expectedDestination.lng);
  if (!originMatches || !destinationMatches) return null;

  await redis.del(routeTokenKey(token));
  return cached;
}
