import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { demandSignals, rides, routeStops } from '../../db/schema/index.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
import { getRoute } from '../../lib/routing.js';
import {
  computeRouteOverlapFraction,
  decodePolyline,
  projectPointOntoRoute,
  type LatLng,
} from '../../lib/polyline.js';
import type { MatchingSearchInput, NotifyMeInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

const TIGHT_PICKUP_RADIUS_M = 2000;
const TIGHT_DROPOFF_RADIUS_M = 3000;
const TIGHT_TIME_WINDOW_MIN = 90;

const WIDE_PICKUP_RADIUS_M = 8000;
const WIDE_DROPOFF_RADIUS_M = 10000;
const WIDE_TIME_WINDOW_MIN = 240;

const WALK_SPEED_M_PER_MIN = 80;
// How close the rider's own route needs to run to a candidate ride's actual
// road path to count as "overlapping" — wide enough to tolerate minor
// street-level detours, tight enough to mean something. Exported: reused by
// stop-candidates.service.ts as the same corridor-distance concept for
// merging nearby candidate stops (docs/domain/ride-engine.md), and by this
// file's own route-passthrough tier (docs/roadmap/phase-13-search-engine.md)
// as the corridor width a rider's origin/destination must project within to
// count as "on this ride's route" — one magic number, not three.
export const OVERLAP_CORRIDOR_WIDTH_M = 150;

// A rider's origin must project onto a candidate ride's route at least this
// much *earlier* (as a 0..1 route fraction) than their destination — guards
// the route-passthrough tier against a degenerate "both points land on
// nearly the same spot on the route" match, which isn't a usable trip.
const MIN_ROUTE_FRACTION_GAP = 0.02;

// How far ahead the closest-departure tier will look for *any* ride on a
// matching corridor once even route-passthrough finds nothing at a
// reasonable time — named and bounded rather than an unbounded "next ever"
// query (docs/roadmap/phase-13-search-engine.md's business rules).
const CLOSEST_DEPARTURE_LOOKAHEAD_DAYS = 14;
const CLOSEST_DEPARTURE_LIMIT = 5;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export interface RankedStop {
  stopId: string;
  label: string;
  lat: number;
  lng: number;
  walkMinutes: number;
}

export type MatchType = 'endpoint' | 'route_passthrough';

export interface MatchCandidate {
  rideId: string;
  driverUserId: string;
  driverFullName: string | null;
  ratingAvg: number;
  tripCount: number;
  departureAt: Date;
  seatsAvailable: number;
  contributionPerSeat: number;
  pickupWalkMinutes: number;
  routeOverlapPercent: number;
  score: number;
  reasons: string[];
  clusterLabel: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  routePolyline: string | null;
  /** This ride's driver-selected route_stops (docs/domain/ride-engine.md),
   *  ranked by walk-distance from the passenger's requested origin,
   *  ascending — the closest/best stop is always index 0. Empty for a
   *  legacy ride published before route_stops existed (zero stops total),
   *  which keeps using the free-form pickup flow. */
  rankedStops: RankedStop[];
  /** Same idea as `rankedStops`, ranked by walk-distance from the
   *  passenger's requested *destination* instead (Phase 13). Empty means
   *  "use the ride's own destination as the dropoff" — the pre-Phase-13
   *  behavior, unchanged for any ride with zero route_stops. */
  rankedDropoffStops: RankedStop[];
  /** False only when this ride has driver-selected route_stops but none of
   *  them fall within a walkable radius of the passenger's requested
   *  origin — a real, legitimate "this ride doesn't reach you
   *  conveniently" result, not an incidental edge case. Always true for a
   *  legacy ride with zero route_stops at all. See "Zero viable stops" in
   *  docs/domain/ride-engine.md for the product decision behind surfacing
   *  (not silently excluding) this case. */
  pickupViable: boolean;
  /** Dropoff-side mirror of `pickupViable` (Phase 13) — false only when the
   *  ride has route_stops but none rank near the passenger's destination. */
  dropoffViable: boolean;
  /** 'route_passthrough' for a ride found because its route runs through
   *  the rider's corridor (the driver's own origin/destination are
   *  elsewhere) rather than because its own endpoints matched — lets the
   *  UI badge these distinctly (docs/roadmap/phase-13-search-engine.md). */
  matchType: MatchType;
}

/**
 * Ranks a ride's driver-selected stops by walk-distance from a reference
 * point (the passenger's requested origin *or* destination — Phase 13 uses
 * this for both), filtering out anything beyond `maxRadiusM`. Pure — no
 * I/O — so it's directly unit-testable against fixed synthetic inputs,
 * mirroring stop-candidates.service.ts's own pure scoring/clustering
 * functions.
 */
export function rankStopsByWalkDistance(
  point: { lat: number; lng: number },
  stops: { id: string; label: string; lat: number; lng: number }[],
  maxRadiusM: number = WIDE_PICKUP_RADIUS_M,
): RankedStop[] {
  return stops
    .map((stop) => ({ stop, distanceM: haversineDistanceMeters(point, stop) }))
    .filter(({ distanceM }) => distanceM <= maxRadiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .map(({ stop, distanceM }) => ({
      stopId: stop.id,
      label: stop.label,
      lat: stop.lat,
      lng: stop.lng,
      walkMinutes: distanceM / WALK_SPEED_M_PER_MIN,
    }));
}

/**
 * Whether a ride can actually be booked given its stop situation. A ride
 * with zero route_stops at all is a legacy ride still on the free-form
 * pickup flow — always viable. A ride WITH driver-selected stops but none
 * ranked within range is the genuine "doesn't reach you conveniently"
 * case (docs/domain/ride-engine.md).
 */
export function isPickupViable(totalStopsCount: number, rankedStopsCount: number): boolean {
  return totalStopsCount === 0 || rankedStopsCount > 0;
}

/** Dropoff-side mirror of `isPickupViable` (Phase 13) — same rule, named
 *  separately so call sites read as "is the dropoff side okay" rather than
 *  reusing a pickup-named function for a different leg of the trip. */
export function isDropoffViable(totalStopsCount: number, rankedDropoffStopsCount: number): boolean {
  return isPickupViable(totalStopsCount, rankedDropoffStopsCount);
}

function buildClusterLabel(timeDeltaMin: number): string {
  if (timeDeltaMin <= 10) return 'Maintenant';
  const rounded = Math.round(timeDeltaMin / 10) * 10;
  return `+${rounded} min`;
}

function buildReasons(params: {
  pickupWalkMinutes: number;
  timeDeltaMin: number;
  routeOverlapPercent: number;
  reliabilityScore: number;
}): string[] {
  const reasons: string[] = [];
  if (params.pickupWalkMinutes <= 5)
    reasons.push(`${Math.round(params.pickupWalkMinutes)} min à pied`);
  if (params.routeOverlapPercent >= 85)
    reasons.push(`${Math.round(params.routeOverlapPercent)}% de trajet commun`);
  if (params.timeDeltaMin <= 15) reasons.push('Proche de votre horaire');
  if (params.reliabilityScore >= 0.9) reasons.push('Conducteur très fiable');
  return reasons;
}

async function fetchPublishedRidesInWindow(db: Database, windowStart: Date, windowEnd: Date) {
  return db.query.rides.findMany({
    where: and(
      eq(rides.status, 'published'),
      gte(rides.departureAt, windowStart),
      lte(rides.departureAt, windowEnd),
    ),
    with: { driverProfile: { with: { user: true } } },
  });
}

type CandidateRide = Awaited<ReturnType<typeof fetchPublishedRidesInWindow>>[number];
type StopRow = { id: string; label: string; lat: number; lng: number };

async function fetchStopsByRide(db: Database, rideIds: string[]): Promise<Map<string, StopRow[]>> {
  const stopsByRide = new Map<string, StopRow[]>();
  if (rideIds.length === 0) return stopsByRide;
  const allSelectedStops = await db.query.routeStops.findMany({
    where: and(inArray(routeStops.rideId, rideIds), eq(routeStops.isDriverSelected, true)),
  });
  for (const stop of allSelectedStops) {
    const list = stopsByRide.get(stop.rideId) ?? [];
    list.push(stop);
    stopsByRide.set(stop.rideId, list);
  }
  return stopsByRide;
}

/**
 * Builds a `MatchCandidate` from a ride whose own origin/destination are
 * being compared directly against the rider's requested points (the
 * pre-Phase-13 matching shape) — extracted from `scoreCandidates`'s former
 * inline loop body so `findClosestDepartures` can reuse the exact same
 * scoring/ranking logic instead of a parallel implementation. Returns null
 * when the ride doesn't qualify (no seats, or outside the given radii).
 */
function buildEndpointCandidate(
  ride: CandidateRide,
  input: MatchingSearchInput,
  ctx: {
    origin: LatLng;
    destination: LatLng;
    riderRoutePoints: LatLng[];
    stopsByRide: Map<string, StopRow[]>;
    pickupRadiusM: number;
    dropoffRadiusM: number;
  },
): MatchCandidate | null {
  if (ride.seatsAvailable < 1) return null;

  const pickupDistanceM = haversineDistanceMeters(ctx.origin, {
    lat: ride.originLat,
    lng: ride.originLng,
  });
  const dropoffDistanceM = haversineDistanceMeters(ctx.destination, {
    lat: ride.destinationLat,
    lng: ride.destinationLng,
  });
  if (pickupDistanceM > ctx.pickupRadiusM || dropoffDistanceM > ctx.dropoffRadiusM) return null;

  const timeDeltaMin = Math.abs(ride.departureAt.getTime() - input.when.getTime()) / 60_000;
  const pickupWalkMinutes = pickupDistanceM / WALK_SPEED_M_PER_MIN;

  // Real road-geometry overlap when both routes have a polyline (rides
  // created before OSRM was wired, or seeded before a backfill, won't —
  // fall back to the old distance-ratio proxy so those still get a
  // reasonable estimate instead of a hard 0%).
  const rideRoutePoints = ride.routePolyline ? decodePolyline(ride.routePolyline) : [];
  const routeOverlapPercent =
    ctx.riderRoutePoints.length > 0 && rideRoutePoints.length > 0
      ? 100 *
        computeRouteOverlapFraction(ctx.riderRoutePoints, rideRoutePoints, OVERLAP_CORRIDOR_WIDTH_M)
      : 100 *
        (1 -
          (pickupDistanceM / TIGHT_PICKUP_RADIUS_M + dropoffDistanceM / TIGHT_DROPOFF_RADIUS_M) / 2);

  const score =
    clamp01(1 - pickupDistanceM / TIGHT_PICKUP_RADIUS_M) * 0.4 +
    clamp01(1 - timeDeltaMin / TIGHT_TIME_WINDOW_MIN) * 0.3 +
    clamp01(1 - dropoffDistanceM / TIGHT_DROPOFF_RADIUS_M) * 0.3;

  const rideStops = ctx.stopsByRide.get(ride.id) ?? [];
  const rankedStops = rankStopsByWalkDistance(ctx.origin, rideStops);
  const rankedDropoffStops = rankStopsByWalkDistance(ctx.destination, rideStops);
  const pickupViable = isPickupViable(rideStops.length, rankedStops.length);
  const dropoffViable = isDropoffViable(rideStops.length, rankedDropoffStops.length);

  return {
    rideId: ride.id,
    driverUserId: ride.driverProfile.userId,
    driverFullName: ride.driverProfile.user?.fullName ?? null,
    ratingAvg: ride.driverProfile.ratingAvg,
    tripCount: ride.driverProfile.tripCount,
    departureAt: ride.departureAt,
    seatsAvailable: ride.seatsAvailable,
    contributionPerSeat: ride.contributionPerSeat,
    pickupWalkMinutes,
    routeOverlapPercent: clamp01(routeOverlapPercent / 100) * 100,
    score,
    originLat: ride.originLat,
    originLng: ride.originLng,
    destinationLat: ride.destinationLat,
    destinationLng: ride.destinationLng,
    routePolyline: ride.routePolyline,
    rankedStops,
    rankedDropoffStops,
    pickupViable,
    dropoffViable,
    matchType: 'endpoint',
    reasons: buildReasons({
      pickupWalkMinutes,
      timeDeltaMin,
      routeOverlapPercent,
      reliabilityScore: ride.driverProfile.reliabilityScore,
    }),
    clusterLabel: buildClusterLabel(timeDeltaMin),
  };
}

async function scoreCandidates(
  db: Database,
  input: MatchingSearchInput,
  pickupRadiusM: number,
  dropoffRadiusM: number,
  timeWindowMin: number,
): Promise<MatchCandidate[]> {
  const windowStart = new Date(input.when.getTime() - timeWindowMin * 60_000);
  const windowEnd = new Date(input.when.getTime() + timeWindowMin * 60_000);
  const candidateRides = await fetchPublishedRidesInWindow(db, windowStart, windowEnd);

  const origin = { lat: input.originLat, lng: input.originLng };
  const destination = { lat: input.destinationLat, lng: input.destinationLng };

  // One OSRM call for the rider's own requested route (cached — cheap even
  // when called again from a different tier's pass).
  const riderRoute = await getRoute(origin, destination);
  const riderRoutePoints = riderRoute.polyline ? decodePolyline(riderRoute.polyline) : [];

  const stopsByRide = await fetchStopsByRide(
    db,
    candidateRides.map((r) => r.id),
  );

  const scored: MatchCandidate[] = [];
  for (const ride of candidateRides) {
    const candidate = buildEndpointCandidate(ride, input, {
      origin,
      destination,
      riderRoutePoints,
      stopsByRide,
      pickupRadiusM,
      dropoffRadiusM,
    });
    if (candidate) scored.push(candidate);
  }

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * The route-passthrough tier (docs/roadmap/phase-13-search-engine.md): finds
 * rides whose own origin/destination don't match the rider at all, but
 * whose actual OSRM-derived road route runs through the rider's requested
 * corridor, in the right order — the mechanic that makes a Tunis→Sfax ride
 * with a Hammamet stop visible to a Hammamet→Sousse search, which
 * `scoreCandidates`'s endpoint-only test can never find by construction.
 *
 * Only surfaces a ride when BOTH ends are actually bookable through real
 * driver-selected `route_stops` (`pickupViable && dropoffViable`) — a raw
 * polyline projection is a geometric fact about the road, not a validated
 * place to stop, and CLAUDE.md's product principle #1 forbids offering an
 * unvalidated pickup/dropoff. A ride with no stops near the rider's
 * projected points is simply excluded from this tier, not included flagged
 * non-viable the way `scoreCandidates` does for endpoint matches — an
 * un-bookable pass-through "match" would just be noise for a tier whose
 * entire purpose is turning up genuinely actionable results.
 */
async function scorePassThroughCandidates(
  db: Database,
  input: MatchingSearchInput,
  corridorWidthM: number,
  timeWindowMin: number,
): Promise<MatchCandidate[]> {
  const windowStart = new Date(input.when.getTime() - timeWindowMin * 60_000);
  const windowEnd = new Date(input.when.getTime() + timeWindowMin * 60_000);
  const candidateRides = await fetchPublishedRidesInWindow(db, windowStart, windowEnd);

  const origin = { lat: input.originLat, lng: input.originLng };
  const destination = { lat: input.destinationLat, lng: input.destinationLng };

  const stopsByRide = await fetchStopsByRide(
    db,
    candidateRides.map((r) => r.id),
  );

  const results: MatchCandidate[] = [];
  for (const ride of candidateRides) {
    if (ride.seatsAvailable < 1) continue;
    if (!ride.routePolyline) continue; // No real route geometry to project onto — skip, don't fabricate.

    const routePoints = decodePolyline(ride.routePolyline);
    if (routePoints.length < 2) continue;

    const originProj = projectPointOntoRoute(origin, routePoints);
    const destProj = projectPointOntoRoute(destination, routePoints);
    if (originProj.distanceM > corridorWidthM || destProj.distanceM > corridorWidthM) continue;
    if (destProj.fraction - originProj.fraction < MIN_ROUTE_FRACTION_GAP) continue;

    const rideStops = stopsByRide.get(ride.id) ?? [];
    const rankedStops = rankStopsByWalkDistance(origin, rideStops);
    const rankedDropoffStops = rankStopsByWalkDistance(destination, rideStops);
    if (rankedStops.length === 0 || rankedDropoffStops.length === 0) continue;

    const pickupWalkMinutes = rankedStops[0]!.walkMinutes;
    const dropoffWalkMinutes = rankedDropoffStops[0]!.walkMinutes;
    const timeDeltaMin = Math.abs(ride.departureAt.getTime() - input.when.getTime()) / 60_000;
    // How much of the rider's requested trip actually lines up with this
    // ride's route — a small bonus for a route whose length roughly
    // matches the rider's segment, not a penalty for long intercity rides
    // (picking up/dropping off along a long route is the whole mechanic).
    const segmentFraction = clamp01(destProj.fraction - originProj.fraction);

    const score =
      clamp01(1 - (pickupWalkMinutes * WALK_SPEED_M_PER_MIN) / TIGHT_PICKUP_RADIUS_M) * 0.35 +
      clamp01(1 - timeDeltaMin / TIGHT_TIME_WINDOW_MIN) * 0.25 +
      clamp01(1 - (dropoffWalkMinutes * WALK_SPEED_M_PER_MIN) / TIGHT_DROPOFF_RADIUS_M) * 0.25 +
      segmentFraction * 0.15;

    results.push({
      rideId: ride.id,
      driverUserId: ride.driverProfile.userId,
      driverFullName: ride.driverProfile.user?.fullName ?? null,
      ratingAvg: ride.driverProfile.ratingAvg,
      tripCount: ride.driverProfile.tripCount,
      departureAt: ride.departureAt,
      seatsAvailable: ride.seatsAvailable,
      contributionPerSeat: ride.contributionPerSeat,
      pickupWalkMinutes,
      // The rider's whole requested trip runs on this ride's route by
      // construction (that's the qualification test above) — a real 100%,
      // not the endpoint-distance proxy `buildEndpointCandidate` uses.
      routeOverlapPercent: 100,
      score,
      originLat: ride.originLat,
      originLng: ride.originLng,
      destinationLat: ride.destinationLat,
      destinationLng: ride.destinationLng,
      routePolyline: ride.routePolyline,
      rankedStops,
      rankedDropoffStops,
      pickupViable: true,
      dropoffViable: true,
      matchType: 'route_passthrough',
      reasons: [
        ...buildReasons({
          pickupWalkMinutes,
          timeDeltaMin,
          routeOverlapPercent: 100,
          reliabilityScore: ride.driverProfile.reliabilityScore,
        }),
        'Sur votre trajet',
      ],
      clusterLabel: buildClusterLabel(timeDeltaMin),
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * The closest-departure tier (docs/roadmap/phase-13-search-engine.md): when
 * nothing on the corridor matches at or near the requested time — not even
 * a route-passthrough match — find the nearest upcoming departure(s) on the
 * same corridor within a bounded lookahead, so "no rides at that exact
 * time" becomes "here's the closest one" instead of an empty screen. Reuses
 * `buildEndpointCandidate`'s wide-radius spatial test; only the ordering
 * (by time-proximity to the request, not by match score) and the time
 * window (no fixed window at all, just a forward-looking lookahead bound)
 * differ from `scoreCandidates`.
 */
async function findClosestDepartures(
  db: Database,
  input: MatchingSearchInput,
): Promise<MatchCandidate[]> {
  const now = new Date();
  const lookaheadEnd = new Date(
    input.when.getTime() + CLOSEST_DEPARTURE_LOOKAHEAD_DAYS * 24 * 60 * 60_000,
  );
  const windowStart = now < input.when ? now : input.when;
  const candidateRides = await fetchPublishedRidesInWindow(db, windowStart, lookaheadEnd);

  const origin = { lat: input.originLat, lng: input.originLng };
  const destination = { lat: input.destinationLat, lng: input.destinationLng };
  const riderRoute = await getRoute(origin, destination);
  const riderRoutePoints = riderRoute.polyline ? decodePolyline(riderRoute.polyline) : [];
  const stopsByRide = await fetchStopsByRide(
    db,
    candidateRides.map((r) => r.id),
  );

  const built: MatchCandidate[] = [];
  for (const ride of candidateRides) {
    const candidate = buildEndpointCandidate(ride, input, {
      origin,
      destination,
      riderRoutePoints,
      stopsByRide,
      pickupRadiusM: WIDE_PICKUP_RADIUS_M,
      dropoffRadiusM: WIDE_DROPOFF_RADIUS_M,
    });
    if (candidate) built.push(candidate);
  }

  return built
    .sort(
      (a, b) =>
        Math.abs(a.departureAt.getTime() - input.when.getTime()) -
        Math.abs(b.departureAt.getTime() - input.when.getTime()),
    )
    .slice(0, CLOSEST_DEPARTURE_LIMIT);
}

export type SearchTier = 'exact' | 'wide_corridor' | 'route_passthrough' | 'closest_departure' | 'none';

export interface SearchResult {
  tier: SearchTier;
  candidates: MatchCandidate[];
  /** Server-built, French, honest explanation of why these results aren't
   *  an exact match — null for `tier: 'exact'` (nothing to explain) and for
   *  `tier: 'none'` (mobile's existing notify-me empty state owns that
   *  copy). Keeps every screen that shows search results saying the same
   *  thing about the same tier, rather than each re-deriving its own
   *  "why these results" heuristic (the problem the pre-Phase-13
   *  results.tsx had with its local time-diff banner logic). */
  message: string | null;
}

const TIER_MESSAGES: Record<'wide_corridor' | 'route_passthrough' | 'closest_departure', string> = {
  wide_corridor:
    "Aucun trajet exactement à l'heure demandée près de vous. Voici les correspondances les plus proches.",
  route_passthrough: 'Ces conducteurs passent par votre trajet en cours de route.',
  closest_departure:
    "Aucun trajet sur cet itinéraire à l'heure demandée. Voici le départ le plus proche.",
};

/**
 * The full search-tier cascade (docs/roadmap/phase-13-search-engine.md):
 * tries progressively looser tiers, in order, returning the first with at
 * least one result. Never returns an empty `tier: 'none'` result while any
 * tier still has something to offer — "show some rides, better than
 * nothing" made a real, server-side guarantee rather than a UI-level
 * illusion built by widening one radius twice.
 */
export async function searchRides(db: Database, input: MatchingSearchInput): Promise<SearchResult> {
  const exact = await scoreCandidates(
    db,
    input,
    TIGHT_PICKUP_RADIUS_M,
    TIGHT_DROPOFF_RADIUS_M,
    TIGHT_TIME_WINDOW_MIN,
  );
  if (exact.length > 0) return { tier: 'exact', candidates: exact, message: null };

  const wide = await scoreCandidates(
    db,
    input,
    WIDE_PICKUP_RADIUS_M,
    WIDE_DROPOFF_RADIUS_M,
    WIDE_TIME_WINDOW_MIN,
  );
  if (wide.length > 0) {
    return { tier: 'wide_corridor', candidates: wide, message: TIER_MESSAGES.wide_corridor };
  }

  const passThrough = await scorePassThroughCandidates(
    db,
    input,
    OVERLAP_CORRIDOR_WIDTH_M,
    WIDE_TIME_WINDOW_MIN,
  );
  if (passThrough.length > 0) {
    return {
      tier: 'route_passthrough',
      candidates: passThrough,
      message: TIER_MESSAGES.route_passthrough,
    };
  }

  const closest = await findClosestDepartures(db, input);
  if (closest.length > 0) {
    return {
      tier: 'closest_departure',
      candidates: closest,
      message: TIER_MESSAGES.closest_departure,
    };
  }

  return { tier: 'none', candidates: [], message: null };
}

/**
 * Phase 11 (docs/roadmap/phase-11-recurring-rides.md): proactive rider-match
 * check for an `enabled` recurring pattern. Deliberately stays on the exact
 * tight-radius/tight-time test only (the pre-Phase-13 `searchRides`'
 * entire behavior) rather than the full Phase 13 cascade — a proactive
 * "your usual ride is available" notification should only ever fire for a
 * genuinely close match, not a route-passthrough or closest-departure
 * substitute the rider never asked to be notified about. Out of this
 * phase's scope per its own Risks section.
 */
export async function findBestMatchForRecurringPattern(
  db: Database,
  pattern: { originLat: number; originLng: number; destinationLat: number; destinationLng: number },
  when: Date,
): Promise<MatchCandidate | null> {
  const candidates = await scoreCandidates(
    db,
    { originLat: pattern.originLat, originLng: pattern.originLng, destinationLat: pattern.destinationLat, destinationLng: pattern.destinationLng, when },
    TIGHT_PICKUP_RADIUS_M,
    TIGHT_DROPOFF_RADIUS_M,
    TIGHT_TIME_WINDOW_MIN,
  );
  return candidates.find((c) => c.pickupViable && c.seatsAvailable > 0) ?? null;
}

export async function createDemandSignal(db: Database, userId: string, input: NotifyMeInput) {
  const [signal] = await db
    .insert(demandSignals)
    .values({
      userId,
      originLabel: input.origin.label,
      originLat: input.origin.lat,
      originLng: input.origin.lng,
      destinationLabel: input.destination.label,
      destinationLat: input.destination.lat,
      destinationLng: input.destination.lng,
      desiredWindowStart: input.desiredWindowStart,
      desiredWindowEnd: input.desiredWindowEnd,
    })
    .returning();
  if (!signal) throw new Error('Failed to create demand signal');
  return signal;
}
