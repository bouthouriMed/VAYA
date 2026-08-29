import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { demandSignals, rides, routeStops, trips } from '../../db/schema/index.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
import { getRoute } from '../../lib/routing.js';
import { getActiveOperationalConfig } from '../operational-config/operational-config.service.js';
import {
  findCandidateRideIdsByCorridor,
  findCandidateRideIdsByEndpoints,
} from '../../lib/spatial.js';
import {
  computeRouteOverlapFraction,
  decodePolyline,
  polylineLengthMeters,
  projectPointOntoRoute,
  type LatLng,
} from '../../lib/polyline.js';
import {
  classifyTripProfile,
  detourAllowanceSec,
  getMatchingThresholds,
  rankStopsByJointOptimum,
  VIA_STOP_DETOUR_BUDGET,
  type JointStopCandidate,
  type MatchingThresholds,
} from '@vaya/domain';
import type { MatchingSearchInput, NotifyMeInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

// TIGHT_PICKUP_RADIUS_M/TIGHT_DROPOFF_RADIUS_M/TIGHT_TIME_WINDOW_MIN are the
// "urban" row of packages/domain's getMatchingThresholds, kept here as the
// fixed (never profile-scaled) radii findBestMatchForRecurringPattern
// deliberately keeps using, per that function's own doc comment — a
// proactive "your usual ride is available" check should always use the
// same tight test regardless of the pattern's own trip length. searchRides
// itself no longer reads these three directly for its tier calls — see
// deriveMatchingThresholds below, whose 'urban' output is required-equal to
// these same numbers (guarded by a domain-level regression test,
// packages/domain/src/matching/__tests__/matching-thresholds.test.ts) so
// this comment can't silently go stale.
const TIGHT_PICKUP_RADIUS_M = 2000;
const TIGHT_DROPOFF_RADIUS_M = 3000;
const TIGHT_TIME_WINDOW_MIN = 90;

// WIDE_PICKUP_RADIUS_M also survives as rankStopsByWalkDistance's own
// standalone default cutoff (used when a caller doesn't pass a radius) —
// everything else that used to read a flat "wide" radius now reads
// deriveMatchingThresholds's profile-scaled equivalent instead.
const WIDE_PICKUP_RADIUS_M = 8000;
const WIDE_TIME_WINDOW_MIN = 240;

// Time windows are deliberately NOT profile-scaled (matching-engine
// architecture plan, §G) — only distance/corridor/detour thresholds are.
// Both tiers' time windows stay flat across every trip profile.

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

// M-091/EDGE-050 (spec §30/§50/§62): how far "behind" the driver's own
// live route-position (as a 0..1 route-length fraction) a candidate pickup
// can still project before EDGE-050's "already passed" rejection kicks in
// — not zero, since projectPointOntoRoute's fixed sampling spacing and
// ordinary GPS noise both introduce a little slack around the driver's
// exact fraction. ASSUMPTION, not calibrated against real data.
const IN_PROGRESS_BEHIND_TOLERANCE_FRACTION = 0.01;

// How far ahead the closest-departure tier will look for *any* ride on a
// matching corridor once even route-passthrough finds nothing at a
// reasonable time — named and bounded rather than an unbounded "next ever"
// query (docs/roadmap/phase-13-search-engine.md's business rules).
const CLOSEST_DEPARTURE_LOOKAHEAD_DAYS = 14;
const CLOSEST_DEPARTURE_LIMIT = 5;

// Two-stage matching (Google/PostGIS location spec §13): the maximum
// candidate set PostGIS's cheap spatial stage narrows a search down to,
// before the existing application-level scoring/ranking (and, once built, a
// precise per-candidate detour calculation) runs on it. Deliberately in the
// 20-50 range the spec names as reasonable at Vaya's actual candidate-set
// sizes — generous enough that a well-matched corridor essentially never
// loses a real candidate to the cap, tight enough to keep the expensive
// per-candidate work (route-overlap scoring today; routing-API detour calls
// in a future phase) bounded regardless of how many rides exist DB-wide.
const POSTGIS_CANDIDATE_CAP = 50;

// --- Detour matching (Google/PostGIS location spec §7) ---------------------
// Real routing-engine detour calculation, distinct from route_passthrough's
// polyline-proximity test: a candidate here is a ride whose route does NOT
// already pass near the rider, but a real multi-waypoint routing call shows
// the driver could reach them within a small, bounded extra cost. Every
// threshold below is a reasoned starting point, explicitly not a measured
// fact — labeled per the location-architecture spec's own instruction not
// to reuse stop-candidates.service.ts's 300m/120s driver-side thresholds
// (a different purpose: that pair gates a driver's OWN stop placement at
// publish time; these gate whether a specific rider's request is worth
// inserting into an already-published route at search time) and to
// recalibrate once real booking-acceptance data exists — see
// docs/product/search-engine-audit-v2-active-trip-2026-08-23.md §7 for the
// full reasoning.

// Cheap PostGIS stage-1 radius (lib/spatial.ts's findCandidateRideIdsByCorridor,
// reused with a wider width than route_passthrough's 150m): a ride whose
// route runs further than this from the rider is not worth an expensive
// per-candidate routing call at all, regardless of how small its eventual
// computed detour might be. ASSUMPTION.
const DETOUR_SEARCH_RADIUS_M = 2500;

// The hard cap on how many candidates ever reach a real routing-API call —
// the single most important number in this tier, since it's what prevents
// the "N candidates x N routing calls" cost explosion the brief explicitly
// warns against (§14). Deliberately smaller than POSTGIS_CANDIDATE_CAP:
// this tier's per-candidate cost is a real network call, not a
// microseconds-cheap in-memory scoring pass. ASSUMPTION, reasoned from the
// audit's 1,000-user-scale candidate-set modeling, not measured.
const DETOUR_CANDIDATE_CAP = 15;

// detourAllowanceSec/MAX_DETOUR_RATIO now live in @vaya/domain
// (packages/domain/src/matching/matching-thresholds.ts) — moved there so
// bookings.service.ts can share the exact same real detour bound when
// validating a free-form pickup/dropoff on a ride with stops, instead of
// duplicating this math in a second module (CLAUDE.md: ride-engine
// business logic belongs in packages/domain, never duplicated).

/**
 * Derives this search's profile-scaled matching thresholds (matching-engine
 * architecture plan §G) from the rider's own requested origin/destination —
 * a straight-line (haversine) distance is deliberately used here rather
 * than a real routed distance, matching `classifyTripProfile`'s own "no
 * network call" contract: classification only needs to distinguish a
 * multi-kilometer commute from a cross-country haul, not a precise route
 * length, and every tier below still runs its own real route/corridor logic
 * on top of these thresholds regardless. `getMatchingThresholds('urban')` is
 * exactly today's pre-existing flat constants (TIGHT_PICKUP_RADIUS_M etc.)
 * — a mid-length trip's search behavior is unchanged by this function's
 * introduction.
 */
export function deriveMatchingThresholds(input: MatchingSearchInput): MatchingThresholds {
  const straightLineDistanceM = haversineDistanceMeters(
    { lat: input.originLat, lng: input.originLng },
    { lat: input.destinationLat, lng: input.destinationLng },
  );
  const profile = classifyTripProfile(straightLineDistanceM);
  return getMatchingThresholds(profile.type);
}

/**
 * M-039: the normalization ceiling `pickRecommendedStopId` uses for a
 * candidate stop's driver-side deviation component — the largest real
 * detour ANY stop on a ride of this trip length could have survived
 * generation with (a freehand 'via' city stop's own profile-scaled budget,
 * always ≥ an auto-generated micro-stop's much tighter MAX_DEVIATION_METERS
 * cap), so both stop kinds land on one coherent 0..1 scale.
 */
function deriveMaxDeviationM(origin: LatLng, destination: LatLng): number {
  const straightLineDistanceM = haversineDistanceMeters(origin, destination);
  const profile = classifyTripProfile(straightLineDistanceM);
  return VIA_STOP_DETOUR_BUDGET[profile.type].maxMeters;
}

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

export type MatchType = 'endpoint' | 'route_passthrough' | 'detour';

export interface MatchCandidate {
  rideId: string;
  driverUserId: string;
  driverFullName: string | null;
  driverAvatarUrl: string | null;
  ratingAvg: number;
  tripCount: number;
  departureAt: Date;
  seatsAvailable: number;
  contributionPerSeat: number;
  pickupWalkMinutes: number;
  /** Dropoff-side mirror of `pickupWalkMinutes` — walk distance from the
   *  passenger's requested destination to their actual dropoff point (the
   *  closest ranked dropoff stop, or the ride's own destination for a
   *  legacy/endpoint match), at the same WALK_SPEED_M_PER_MIN pace. Always
   *  present so the client never has to fall back to a second, differently-
   *  tuned client-side estimate for this leg. */
  dropoffWalkMinutes: number;
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
  /** M-039 (spec §13): VAYA's own genuine joint-optimum recommendation —
   *  the stop id (from `rankedStops`) that best balances the passenger's
   *  walk distance AND the driver's real detour cost/road suitability, not
   *  merely the closest one by foot (`rankedStops[0]`, which those two can
   *  genuinely disagree on). Null whenever `rankedStops` is empty. */
  recommendedStopId: string | null;
  /** Dropoff-side mirror of `recommendedStopId`, over `rankedDropoffStops`. */
  recommendedDropoffStopId: string | null;
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
   *  UI badge these distinctly (docs/roadmap/phase-13-search-engine.md).
   *  'detour' (Google/PostGIS location spec §7): a ride whose route does
   *  NOT already pass near the rider, but a real routing-engine calculation
   *  (origin -> pickup -> dropoff -> destination, via the active
   *  RoutingProvider) shows the driver could reach them within a small,
   *  bounded extra cost. */
  matchType: MatchType;
  /** Populated only for matchType: 'detour' — the real, routing-engine-
   *  calculated cost of inserting this rider's pickup/dropoff into the
   *  driver's route, vs. the ride's own already-computed baseline. Never
   *  estimated from straight-line distance (CLAUDE.md: never show
   *  fabricated numbers) — null whenever the precise calculation itself
   *  wasn't run for this candidate. */
  detour: {
    extraDurationSeconds: number;
    extraDistanceMeters: number;
    /** extraDurationSeconds / the ride's own baseline duration — the
     *  normalized figure the hard-rejection bound is actually expressed in
     *  (a fixed detour-minutes bound means very different things on a
     *  5-minute hop vs. a 3-hour intercity trip — see MAX_DETOUR_RATIO). */
    detourRatio: number;
  } | null;
  /** Seconds after `departureAt` when the driver is realistically expected
   *  to reach THIS passenger's actual pickup point — real in every case,
   *  never just `departureAt` re-shown as if it were the pickup time (a
   *  real bug found live: a passenger matched mid-route saw the driver's
   *  own origin departure time labeled as their own pickup time). 0 for
   *  'endpoint' (pickup is the ride's own origin, by construction of that
   *  tier's own radius test); a route-fraction share of the ride's real
   *  total duration for 'route_passthrough' (the stop sits partway through
   *  a real, already-computed route); the routing engine's own real
   *  with-insertion ETA for 'detour'. */
  pickupEtaSeconds: number;
  /** Dropoff-side mirror of `pickupEtaSeconds`. */
  dropoffEtaSeconds: number;
  /** Real routing-engine-computed polyline for THIS passenger's own pickup
   *  -> dropoff leg — populated only for matchType 'detour', whose pickup/
   *  dropoff are NOT points on the ride's own stored route at all (that's
   *  the whole mechanic: the driver would leave their route to reach them).
   *  Showing `routePolyline` (the driver's unrelated full trip) for a
   *  detour match would be a real, reported bug — the passenger's ride-
   *  details map must show their own leg, not the driver's whole journey.
   *  Null for every other matchType, which already has a real on-route
   *  segment to slice out of `routePolyline` instead. */
  detourRoutePolyline: string | null;
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

/**
 * Fetches published, time-windowed rides. When `candidateIds` is provided
 * (the PostGIS stage-1 filter already ran and returned a narrowed set —
 * lib/spatial.ts), fetches exactly those rows instead of re-scanning the
 * whole time window — the two-stage architecture's actual saving. When it's
 * `undefined` (PostGIS disabled, or its query failed — spatial.ts returns
 * `null` for either case, callers pass that through as `undefined` here),
 * falls back to the original full time-windowed scan, unchanged — this is
 * the exact pre-PostGIS behavior every existing test already exercises, so
 * nothing about that path's semantics changes, only whether it runs at all.
 */
async function fetchPublishedRidesInWindow(
  db: Database,
  windowStart: Date,
  windowEnd: Date,
  candidateIds?: string[],
) {
  if (candidateIds) {
    if (candidateIds.length === 0) return [];
    return db.query.rides.findMany({
      where: and(eq(rides.status, 'published'), inArray(rides.id, candidateIds)),
      with: { driverProfile: { with: { user: true } } },
    });
  }
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
type StopRow = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  // M-039: the driver-side signal computed once at stop-candidates.service.ts's
  // generation time — carried through here so this module's ranking can
  // actually use it instead of discarding it.
  suitabilityScore: number;
  deviationMeters: number;
};

/**
 * M-039 (spec §13): VAYA's own genuine joint-optimum recommendation among a
 * ride's already-walkable stops — considers both the passenger's real walk
 * distance AND the driver-side cost/suitability `stop-candidates.service.ts`
 * already computed at generation time, via `@vaya/domain`'s
 * rankStopsByJointOptimum (see that module's doc comment for the full
 * "two disconnected single-objective passes" gap this closes). Purely
 * additive: `rankedStops`' own walk-distance ordering is unchanged — this
 * only decides which single stop, among those already offered, is VAYA's
 * actual recommendation, distinct from "closest by foot".
 */
function pickRecommendedStopId(
  rankedStops: RankedStop[],
  rideStops: StopRow[],
  maxWalkDistanceM: number,
  maxDeviationM: number,
): string | null {
  if (rankedStops.length === 0) return null;
  const stopsById = new Map(rideStops.map((s) => [s.id, s]));
  const candidates: JointStopCandidate[] = [];
  for (const r of rankedStops) {
    const stop = stopsById.get(r.stopId);
    if (!stop) continue;
    candidates.push({
      stopId: r.stopId,
      walkDistanceMeters: r.walkMinutes * WALK_SPEED_M_PER_MIN,
      suitabilityScore: stop.suitabilityScore,
      deviationMeters: stop.deviationMeters,
    });
  }
  if (candidates.length === 0) return null;
  const ranked = rankStopsByJointOptimum(candidates, maxWalkDistanceM, maxDeviationM);
  return ranked[0]?.stopId ?? null;
}

/**
 * M-091 (spec §30): each in-progress ride's real, already-reported live GPS
 * fix — never fabricated from the ride's (by definition, already-passed)
 * stored origin. A ride can have several `trips` rows (one per accepted
 * booking, all sharing the one driver's physical position — see
 * apps/mobile's useDriverLocationBroadcast), so this picks whichever of a
 * ride's trips most recently reported a real fix; a ride with zero trips
 * that have ever reported one is simply absent from the returned map.
 */
async function fetchLiveTripPositionsByRide(db: Database, rideIds: string[]): Promise<Map<string, LatLng>> {
  const positions = new Map<string, LatLng>();
  if (rideIds.length === 0) return positions;
  const tripRows = await db.query.trips.findMany({
    where: and(inArray(trips.rideId, rideIds), isNotNull(trips.currentLat), isNotNull(trips.currentLng)),
    orderBy: (t, { desc }) => desc(t.locationUpdatedAt),
  });
  for (const trip of tripRows) {
    if (!positions.has(trip.rideId) && trip.currentLat != null && trip.currentLng != null) {
      positions.set(trip.rideId, { lat: trip.currentLat, lng: trip.currentLng });
    }
  }
  return positions;
}

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
    maxDeviationM: number;
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
  const dropoffWalkMinutes = dropoffDistanceM / WALK_SPEED_M_PER_MIN;

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
  const recommendedStopId = pickRecommendedStopId(rankedStops, rideStops, ctx.pickupRadiusM, ctx.maxDeviationM);
  const recommendedDropoffStopId = pickRecommendedStopId(
    rankedDropoffStops,
    rideStops,
    ctx.dropoffRadiusM,
    ctx.maxDeviationM,
  );

  return {
    rideId: ride.id,
    driverUserId: ride.driverProfile.userId,
    driverFullName: ride.driverProfile.user?.fullName ?? null,
    driverAvatarUrl: ride.driverProfile.user?.avatarUrl ?? null,
    ratingAvg: ride.driverProfile.ratingAvg,
    tripCount: ride.driverProfile.tripCount,
    departureAt: ride.departureAt,
    seatsAvailable: ride.seatsAvailable,
    contributionPerSeat: ride.contributionPerSeat,
    pickupWalkMinutes,
    dropoffWalkMinutes,
    routeOverlapPercent: clamp01(routeOverlapPercent / 100) * 100,
    score,
    originLat: ride.originLat,
    originLng: ride.originLng,
    destinationLat: ride.destinationLat,
    destinationLng: ride.destinationLng,
    routePolyline: ride.routePolyline,
    rankedStops,
    rankedDropoffStops,
    recommendedStopId,
    recommendedDropoffStopId,
    pickupViable,
    dropoffViable,
    matchType: 'endpoint',
    detour: null,
    // Pickup ≈ the ride's own origin, by construction of this tier's own
    // tight radius test — 0 offset is a real statement about that
    // geometry, not a shortcut. Dropoff ≈ the ride's own full duration
    // later, for the same reason.
    pickupEtaSeconds: 0,
    dropoffEtaSeconds: ride.estimatedDurationSec ?? 0,
    detourRoutePolyline: null,
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

  const origin = { lat: input.originLat, lng: input.originLng };
  const destination = { lat: input.destinationLat, lng: input.destinationLng };

  // Two-stage matching, stage 1 (Google/PostGIS location spec §13): a cheap,
  // GiST-indexed spatial query narrows the candidate set in the database
  // before any application-level scoring runs. `null` (PostGIS disabled or
  // the query failed) falls back to the pre-existing full time-windowed scan
  // exactly as before — never a silent behavior change, only a performance
  // one when it succeeds.
  const candidateIds = await findCandidateRideIdsByEndpoints(
    db,
    origin,
    destination,
    pickupRadiusM,
    dropoffRadiusM,
    windowStart,
    windowEnd,
    POSTGIS_CANDIDATE_CAP,
  );
  const candidateRides = await fetchPublishedRidesInWindow(
    db,
    windowStart,
    windowEnd,
    candidateIds ?? undefined,
  );

  // One OSRM call for the rider's own requested route (cached — cheap even
  // when called again from a different tier's pass).
  const riderRoute = await getRoute(origin, destination);
  const riderRoutePoints = riderRoute.polyline ? decodePolyline(riderRoute.polyline) : [];

  const stopsByRide = await fetchStopsByRide(
    db,
    candidateRides.map((r) => r.id),
  );
  const maxDeviationM = deriveMaxDeviationM(origin, destination);

  const scored: MatchCandidate[] = [];
  for (const ride of candidateRides) {
    const candidate = buildEndpointCandidate(ride, input, {
      origin,
      destination,
      riderRoutePoints,
      stopsByRide,
      pickupRadiusM,
      dropoffRadiusM,
      maxDeviationM,
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
  thresholds: MatchingThresholds,
  timeWindowMin: number,
): Promise<MatchCandidate[]> {
  const windowStart = new Date(input.when.getTime() - timeWindowMin * 60_000);
  const windowEnd = new Date(input.when.getTime() + timeWindowMin * 60_000);
  // The PostGIS pre-filter and the qualification test below both use the
  // WIDE walkability radius, not the tighter corridorWidthM — see the real
  // bug this fixed: a passenger searching "Zaragoza" gets a city-center
  // geocode that can genuinely sit several km from the highway a driver's
  // route actually follows, even though a real, driver-placed stop near
  // that highway exit is a perfectly walkable/reasonable distance from
  // them. Gating on distance-to-the-raw-route-LINE conflated "near the
  // road" with "near a usable stop" — exactly the assumption route_stops
  // exists to NOT make (a stop can legitimately sit up to 300m off-route
  // by design, or further for a driver's manually-placed pin). The
  // stop-walkability check further down is the real, correct
  // qualification bar; this radius only needs to be wide enough not to
  // exclude a candidate before that check even runs.
  const candidateSearchRadiusM = Math.max(thresholds.widePickupRadiusM, thresholds.wideDropoffRadiusM);

  const origin = { lat: input.originLat, lng: input.originLng };
  const destination = { lat: input.destinationLat, lng: input.destinationLng };

  // Two-stage matching, stage 1: PostGIS's route_geom (populated from the
  // same routePolyline this tier already requires) lets the corridor
  // proximity test itself run as a GiST-indexed SQL query instead of
  // decoding+resampling+projecting every time-windowed ride's polyline in
  // Node — this is the specific step v1/v2 of the search-engine audit
  // flagged as the biggest architectural risk (an unbounded, synchronous,
  // per-candidate CPU cost with no spatial pre-filter). Falls back to the
  // full scan, unchanged, when PostGIS is unavailable.
  const candidateIds = await findCandidateRideIdsByCorridor(
    db,
    origin,
    destination,
    candidateSearchRadiusM,
    windowStart,
    windowEnd,
    POSTGIS_CANDIDATE_CAP,
  );
  const candidateRides = await fetchPublishedRidesInWindow(
    db,
    windowStart,
    windowEnd,
    candidateIds ?? undefined,
  );

  const stopsByRide = await fetchStopsByRide(
    db,
    candidateRides.map((r) => r.id),
  );
  const maxDeviationM = deriveMaxDeviationM(origin, destination);

  const results: MatchCandidate[] = [];
  for (const ride of candidateRides) {
    if (ride.seatsAvailable < 1) continue;
    if (!ride.routePolyline) continue; // No real route geometry to project onto — skip, don't fabricate.

    const routePoints = decodePolyline(ride.routePolyline);
    if (routePoints.length < 2) continue;

    // Fraction-only: used for direction-order (below) and the segment-
    // fraction scoring bonus — NOT as a distance-based rejection gate
    // anymore (see candidateSearchRadiusM's comment above for why).
    const originProj = projectPointOntoRoute(origin, routePoints);
    const destProj = projectPointOntoRoute(destination, routePoints);
    if (destProj.fraction - originProj.fraction < MIN_ROUTE_FRACTION_GAP) continue;

    const rideStops = stopsByRide.get(ride.id) ?? [];
    const rankedStops = rankStopsByWalkDistance(origin, rideStops);
    const rankedDropoffStops = rankStopsByWalkDistance(destination, rideStops);
    if (rankedStops.length === 0 || rankedDropoffStops.length === 0) continue;
    // rankStopsByWalkDistance was called with no explicit radius above, so
    // it used its own default cutoff (WIDE_PICKUP_RADIUS_M) for both
    // pickup and dropoff — the normalization ceiling here must match that,
    // not candidateSearchRadiusM (a different, PostGIS-pre-filter radius).
    const recommendedStopId = pickRecommendedStopId(rankedStops, rideStops, WIDE_PICKUP_RADIUS_M, maxDeviationM);
    const recommendedDropoffStopId = pickRecommendedStopId(
      rankedDropoffStops,
      rideStops,
      WIDE_PICKUP_RADIUS_M,
      maxDeviationM,
    );

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
      driverAvatarUrl: ride.driverProfile.user?.avatarUrl ?? null,
      ratingAvg: ride.driverProfile.ratingAvg,
      tripCount: ride.driverProfile.tripCount,
      departureAt: ride.departureAt,
      seatsAvailable: ride.seatsAvailable,
      contributionPerSeat: ride.contributionPerSeat,
      pickupWalkMinutes,
      dropoffWalkMinutes,
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
      recommendedStopId,
      recommendedDropoffStopId,
      pickupViable: true,
      dropoffViable: true,
      matchType: 'route_passthrough',
      detour: null,
      // The stop sits partway through a real, already-computed route — a
      // route-fraction share of the ride's real total duration, the same
      // honest approximation scoreDetourCandidates already uses for its own
      // ETA (no per-leg breakdown exists from the routing provider without
      // doubling the routing cost — see that tier's own doc comment).
      pickupEtaSeconds: Math.round((ride.estimatedDurationSec ?? 0) * clamp01(originProj.fraction)),
      dropoffEtaSeconds: Math.round((ride.estimatedDurationSec ?? 0) * clamp01(destProj.fraction)),
      detourRoutePolyline: null,
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
 * M-091/EDGE-050 (spec §30, §50, §62 — the audit's own P0 finding): a trip
 * that has already started is NOT invisible to search. Spec's own example:
 * "Driver: Madrid -> Barcelona has already left Madrid. While approaching
 * Zaragoza: Passenger searches Zaragoza -> Barcelona. VAYA should evaluate
 * the request against the driver's current position and remaining
 * journey... If feasible, the passenger can receive the trip." Before this,
 * every tier filtered strictly on `status = 'published'` — the instant a
 * trip started (`syncRideStatusOnTripStart` flips `rides.status` to
 * `in_progress`), the ride vanished from search entirely, with zero regard
 * for how much genuinely-feasible route remained ahead of the driver.
 *
 * Reuses `scorePassThroughCandidates`'s own route-projection/stop-viability
 * qualification (this is fundamentally the same mechanic — a real driver-
 * selected stop sitting on the road ahead of the rider), with the two real
 * differences that mechanic doesn't have: (1) `status = 'in_progress'`
 * rather than `published`, evaluated against the driver's real live
 * position rather than the ride's stale stored origin, and (2) EDGE-050's
 * hard rejection — a candidate pickup (or an offerable stop) that projects
 * BEHIND the driver's own current route-position is never offered, however
 * close it is to the rider. A ride whose driver hasn't reported a single
 * GPS fix yet has no real "current position" to evaluate against and is
 * skipped outright — never assume the stale origin is still current.
 *
 * No PostGIS stage-1 filter here (unlike the other tiers): the candidate
 * pool this scans is bounded by "how many rides are genuinely in progress
 * right now", not "how many rides exist total" — a full scan of that small,
 * transient set is cheap enough not to need the two-stage architecture the
 * other, much larger candidate pools do.
 */
async function scoreInProgressCandidates(
  db: Database,
  input: MatchingSearchInput,
  timeWindowMin: number,
): Promise<MatchCandidate[]> {
  const windowStart = new Date(input.when.getTime() - timeWindowMin * 60_000);
  const windowEnd = new Date(input.when.getTime() + timeWindowMin * 60_000);

  const origin = { lat: input.originLat, lng: input.originLng };
  const destination = { lat: input.destinationLat, lng: input.destinationLng };

  const candidateRides = await db.query.rides.findMany({
    where: and(
      eq(rides.status, 'in_progress'),
      gte(rides.departureAt, windowStart),
      lte(rides.departureAt, windowEnd),
    ),
    with: { driverProfile: { with: { user: true } } },
  });
  if (candidateRides.length === 0) return [];

  const livePositionByRide = await fetchLiveTripPositionsByRide(
    db,
    candidateRides.map((r) => r.id),
  );
  const stopsByRide = await fetchStopsByRide(
    db,
    candidateRides.map((r) => r.id),
  );
  const maxDeviationM = deriveMaxDeviationM(origin, destination);

  const results: MatchCandidate[] = [];
  for (const ride of candidateRides) {
    if (ride.seatsAvailable < 1) continue;
    if (!ride.routePolyline) continue; // No real route geometry to project onto — skip, don't fabricate.

    const livePos = livePositionByRide.get(ride.id);
    if (!livePos) continue; // No real reported position yet — never assume the stale origin is still current.

    const routePoints = decodePolyline(ride.routePolyline);
    if (routePoints.length < 2) continue;

    const driverProj = projectPointOntoRoute(livePos, routePoints);
    const originProj = projectPointOntoRoute(origin, routePoints);
    const destProj = projectPointOntoRoute(destination, routePoints);

    // EDGE-050: a pickup already behind the driver's real live position is
    // never offered, however close it is to the rider.
    if (originProj.fraction < driverProj.fraction - IN_PROGRESS_BEHIND_TOLERANCE_FRACTION) continue;
    if (destProj.fraction - originProj.fraction < MIN_ROUTE_FRACTION_GAP) continue;

    const rideStops = stopsByRide.get(ride.id) ?? [];
    // Same EDGE-050 guarantee, applied to which of the driver's own
    // selected stops are even offerable: a stop the driver has already
    // physically driven past can't be walked back to, regardless of how
    // close it sits to the rider's requested point.
    const stopsAheadOfDriver = rideStops.filter(
      (stop) =>
        projectPointOntoRoute(stop, routePoints).fraction >=
        driverProj.fraction - IN_PROGRESS_BEHIND_TOLERANCE_FRACTION,
    );
    const rankedStops = rankStopsByWalkDistance(origin, stopsAheadOfDriver);
    const rankedDropoffStops = rankStopsByWalkDistance(destination, stopsAheadOfDriver);

    // M-091 real gap, found and fixed while verifying this tier end-to-end
    // (a real HTTP journey, not just the direct-service-call integration
    // test): the spec's own worked example — "Passenger searches Zaragoza
    // -> Barcelona" where Barcelona is the driver's own, unchanged final
    // destination — was unmatchable, because this tier unconditionally
    // required BOTH ends to resolve via a real route_stop (mirroring
    // scorePassThroughCandidates, whose pure-passthrough case genuinely
    // needs that). A search endpoint that's simply the ride's own
    // origin/destination doesn't need a stop at all — mirrors
    // buildEndpointCandidate's own direct-radius check, the same real
    // property that already lets an ordinary published-ride search work
    // this way.
    const originMatchesRideOriginM = haversineDistanceMeters(origin, {
      lat: ride.originLat,
      lng: ride.originLng,
    });
    const destMatchesRideDestinationM = haversineDistanceMeters(destination, {
      lat: ride.destinationLat,
      lng: ride.destinationLng,
    });
    const pickupViaRideOrigin = originMatchesRideOriginM <= WIDE_PICKUP_RADIUS_M;
    const dropoffViaRideDestination = destMatchesRideDestinationM <= WIDE_PICKUP_RADIUS_M;
    if (rankedStops.length === 0 && !pickupViaRideOrigin) continue;
    if (rankedDropoffStops.length === 0 && !dropoffViaRideDestination) continue;

    const recommendedStopId = pickRecommendedStopId(
      rankedStops,
      stopsAheadOfDriver,
      WIDE_PICKUP_RADIUS_M,
      maxDeviationM,
    );
    const recommendedDropoffStopId = pickRecommendedStopId(
      rankedDropoffStops,
      stopsAheadOfDriver,
      WIDE_PICKUP_RADIUS_M,
      maxDeviationM,
    );

    const pickupWalkMinutes = rankedStops[0]?.walkMinutes ?? originMatchesRideOriginM / WALK_SPEED_M_PER_MIN;
    const dropoffWalkMinutes =
      rankedDropoffStops[0]?.walkMinutes ?? destMatchesRideDestinationM / WALK_SPEED_M_PER_MIN;
    const timeDeltaMin = Math.abs(ride.departureAt.getTime() - input.when.getTime()) / 60_000;
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
      driverAvatarUrl: ride.driverProfile.user?.avatarUrl ?? null,
      ratingAvg: ride.driverProfile.ratingAvg,
      tripCount: ride.driverProfile.tripCount,
      departureAt: ride.departureAt,
      seatsAvailable: ride.seatsAvailable,
      contributionPerSeat: ride.contributionPerSeat,
      pickupWalkMinutes,
      dropoffWalkMinutes,
      routeOverlapPercent: 100,
      score,
      originLat: ride.originLat,
      originLng: ride.originLng,
      destinationLat: ride.destinationLat,
      destinationLng: ride.destinationLng,
      routePolyline: ride.routePolyline,
      rankedStops,
      rankedDropoffStops,
      recommendedStopId,
      recommendedDropoffStopId,
      pickupViable: true,
      dropoffViable: true,
      matchType: 'route_passthrough',
      detour: null,
      pickupEtaSeconds: Math.round((ride.estimatedDurationSec ?? 0) * clamp01(originProj.fraction)),
      dropoffEtaSeconds: Math.round((ride.estimatedDurationSec ?? 0) * clamp01(destProj.fraction)),
      detourRoutePolyline: null,
      reasons: [
        ...buildReasons({
          pickupWalkMinutes,
          timeDeltaMin,
          routeOverlapPercent: 100,
          reliabilityScore: ride.driverProfile.reliabilityScore,
        }),
        'Déjà en route vers votre trajet',
      ],
      clusterLabel: buildClusterLabel(timeDeltaMin),
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * The detour-match tier (Google/PostGIS location spec §7): for rides whose
 * route does NOT already pass within OVERLAP_CORRIDOR_WIDTH_M of the rider
 * (route_passthrough already found those), ask the active RoutingProvider
 * what it would actually cost — in real road-network time, not straight-
 * line distance — to insert the rider's pickup and dropoff into the
 * driver's route. Two-stage, cost-bounded exactly per the brief's own
 * warning against an N-candidates x N-routing-calls architecture:
 *
 *   PostGIS cheap radius filter (DETOUR_SEARCH_RADIUS_M, wider than
 *   route_passthrough's tight corridor)
 *     -> capped to DETOUR_CANDIDATE_CAP candidates
 *     -> exactly one real getRoute(...) call per surviving candidate
 *
 * A candidate only survives when the real computed extra duration fits
 * within detourAllowanceSec(baseline) — never a raw distance/proximity
 * proxy. Every returned candidate is `pickupViable: false` /
 * `dropoffViable: false`: this tier surfaces a real, calculated
 * possibility, not a bookable stop — see MatchCandidate.detour's doc
 * comment for why turning this into an actual booking is deliberately out
 * of this pass's scope.
 */
async function scoreDetourCandidates(
  db: Database,
  input: MatchingSearchInput,
  timeWindowMin: number,
  thresholds: MatchingThresholds,
  maxDetourRatio: number,
): Promise<MatchCandidate[]> {
  const windowStart = new Date(input.when.getTime() - timeWindowMin * 60_000);
  const windowEnd = new Date(input.when.getTime() + timeWindowMin * 60_000);

  const origin = { lat: input.originLat, lng: input.originLng };
  const destination = { lat: input.destinationLat, lng: input.destinationLng };

  const candidateIds = await findCandidateRideIdsByCorridor(
    db,
    origin,
    destination,
    DETOUR_SEARCH_RADIUS_M,
    windowStart,
    windowEnd,
    DETOUR_CANDIDATE_CAP,
  );
  // Unlike the other tiers, a null (PostGIS disabled/unavailable) result
  // here means "skip this tier entirely" rather than "fall back to a full
  // scan" — running a real routing-API call against every time-windowed
  // ride with no spatial pre-filter at all is exactly the cost explosion
  // this whole two-stage design exists to prevent. Search still works
  // correctly without PostGIS (route_passthrough/closest_departure still
  // run); it just doesn't get this specific tier.
  if (!candidateIds || candidateIds.length === 0) return [];

  const candidateRides = await db.query.rides.findMany({
    where: and(eq(rides.status, 'published'), inArray(rides.id, candidateIds)),
    with: { driverProfile: { with: { user: true } } },
  });
  const stopsByRide = await fetchStopsByRide(
    db,
    candidateRides.map((r) => r.id),
  );

  const results: MatchCandidate[] = [];
  for (const ride of candidateRides) {
    if (ride.seatsAvailable < 1) continue;
    if (!ride.routePolyline || !ride.estimatedDurationSec) continue; // No real baseline to compare against.

    const routePoints = decodePolyline(ride.routePolyline);
    const originProj = projectPointOntoRoute(origin, routePoints);
    const destProj = projectPointOntoRoute(destination, routePoints);
    // Real bug found live: a rider's origin/destination genuinely on this
    // ride's route (Madrid, sitting right on a Tortosa->Plasencia route)
    // went entirely unmatched — route_passthrough correctly excluded it
    // (no real driver-selected route_stop exists near Madrid, and that
    // tier never offers an unvalidated pickup, per CLAUDE.md product
    // principle #1), but this tier ALSO skipped it on the assumption that
    // "geometrically on the corridor" means "route_passthrough already
    // covers it" — false whenever no walkable stop exists there. Only skip
    // the real routing call when route_passthrough's actual qualification
    // bar (real walkable stops on BOTH ends, scorePassThroughCandidates'
    // own doc comment) would genuinely have surfaced this ride — otherwise
    // let the real routing call run and decide honestly: a point truly on
    // the route will naturally come back with a near-zero extra duration
    // and surface here as a low-detour, driver-confirmation-required
    // match instead of being silently dropped by every tier.
    const rideStops = stopsByRide.get(ride.id) ?? [];
    const passThroughWouldQualify =
      rankStopsByWalkDistance(origin, rideStops).length > 0 &&
      rankStopsByWalkDistance(destination, rideStops).length > 0 &&
      originProj.distanceM <= thresholds.corridorWidthM &&
      destProj.distanceM <= thresholds.corridorWidthM &&
      destProj.fraction - originProj.fraction >= MIN_ROUTE_FRACTION_GAP;
    if (passThroughWouldQualify) continue;

    // The one real routing-API call this candidate costs: origin -> pickup
    // -> dropoff -> destination, in that order (pickup must precede
    // dropoff — never left to the routing engine to reorder).
    const withInsertion = await getRoute(
      { lat: ride.originLat, lng: ride.originLng },
      { lat: ride.destinationLat, lng: ride.destinationLng },
      [origin, destination],
    );
    if (withInsertion.isEstimate) continue; // No real routing engine reachable — never fabricate a detour number from a haversine fallback.

    const extraDurationSeconds = Math.max(0, withInsertion.durationSec - ride.estimatedDurationSec);
    const allowanceSec = detourAllowanceSec(
      ride.estimatedDurationSec,
      thresholds.detourFloorSec,
      thresholds.detourCeilingSec,
      maxDetourRatio,
    );
    if (extraDurationSeconds > allowanceSec) continue;

    const baselineDistanceM = polylineLengthMeters(routePoints);
    const extraDistanceMeters = Math.max(0, Math.round(withInsertion.distanceM - baselineDistanceM));
    const detourRatio = clamp01(extraDurationSeconds / ride.estimatedDurationSec);

    // ETA to pickup/dropoff along the WITH-INSERTION route — approximated
    // from that route's total duration split proportionally by distance to
    // each waypoint along the ride's own baseline path, since neither
    // RoutingProvider.computeRoute's return shape (kept intentionally
    // minimal, matching computeRoute's existing single-leg contract) nor a
    // second per-leg call is available here without doubling the routing
    // cost this tier exists to bound. A real per-leg breakdown (from the
    // provider's own leg/step data) is a reasonable future refinement, not
    // built here — flagged, not silently approximated as if it were exact.
    const pickupFraction = clamp01(originProj.fraction);
    const dropoffFraction = clamp01(destProj.fraction);
    const pickupEtaSeconds = Math.round(withInsertion.durationSec * pickupFraction);
    const dropoffEtaSeconds = Math.round(withInsertion.durationSec * dropoffFraction);

    const timeDeltaMin = Math.abs(ride.departureAt.getTime() - input.when.getTime()) / 60_000;
    const pickupWalkMinutes = 0; // No walk — this tier's whole point is the driver detouring TO the rider, not the rider walking to the route.
    const dropoffWalkMinutes = 0; // Same reasoning — the driver detours to the rider's actual dropoff too.

    const score =
      clamp01(1 - detourRatio / (maxDetourRatio * 1.2)) * 0.5 +
      clamp01(1 - timeDeltaMin / TIGHT_TIME_WINDOW_MIN) * 0.3 +
      clamp01(1 - extraDurationSeconds / thresholds.detourCeilingSec) * 0.2;

    results.push({
      rideId: ride.id,
      driverUserId: ride.driverProfile.userId,
      driverFullName: ride.driverProfile.user?.fullName ?? null,
      driverAvatarUrl: ride.driverProfile.user?.avatarUrl ?? null,
      ratingAvg: ride.driverProfile.ratingAvg,
      tripCount: ride.driverProfile.tripCount,
      departureAt: ride.departureAt,
      seatsAvailable: ride.seatsAvailable,
      contributionPerSeat: ride.contributionPerSeat,
      pickupWalkMinutes,
      dropoffWalkMinutes,
      routeOverlapPercent: 0,
      score,
      originLat: ride.originLat,
      originLng: ride.originLng,
      destinationLat: ride.destinationLat,
      destinationLng: ride.destinationLng,
      routePolyline: ride.routePolyline,
      rankedStops: [],
      rankedDropoffStops: [],
      // No real driver-selected stop is involved at all in a detour match
      // (see the pickupViable/dropoffViable comment right below).
      recommendedStopId: null,
      recommendedDropoffStopId: null,
      // Deliberately false — see MatchCandidate.detour's doc comment. This
      // tier surfaces a real, calculated possibility, not a bookable stop.
      pickupViable: false,
      dropoffViable: false,
      matchType: 'detour',
      detour: { extraDurationSeconds, extraDistanceMeters, detourRatio },
      pickupEtaSeconds,
      dropoffEtaSeconds,
      // Real routing-engine polyline for THIS passenger's own leg (origin
      // -> pickup -> dropoff -> destination) — lets ride-details.tsx show
      // the passenger their own route instead of the driver's unrelated
      // full trip (see MatchCandidate.detourRoutePolyline's doc comment).
      detourRoutePolyline: withInsertion.polyline,
      reasons: [`+${Math.round(extraDurationSeconds / 60)} min de détour pour le conducteur`],
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
  thresholds: MatchingThresholds,
): Promise<MatchCandidate[]> {
  const now = new Date();
  const lookaheadEnd = new Date(
    input.when.getTime() + CLOSEST_DEPARTURE_LOOKAHEAD_DAYS * 24 * 60 * 60_000,
  );
  const windowStart = now < input.when ? now : input.when;

  const origin = { lat: input.originLat, lng: input.originLng };
  const destination = { lat: input.destinationLat, lng: input.destinationLng };

  // Two-stage matching, stage 1: this tier's 14-day lookahead is the widest
  // time window of the whole cascade and previously had no database-level
  // row bound at all (flagged directly by the prior search-engine audit,
  // v2 §16 P2.2, as the single largest unbounded-fetch risk in the whole
  // matching path) — the PostGIS spatial filter both narrows AND, via its
  // own LIMIT, bounds this query the same way it does for the other tiers.
  const candidateIds = await findCandidateRideIdsByEndpoints(
    db,
    origin,
    destination,
    thresholds.widePickupRadiusM,
    thresholds.wideDropoffRadiusM,
    windowStart,
    lookaheadEnd,
    POSTGIS_CANDIDATE_CAP,
  );
  const candidateRides = await fetchPublishedRidesInWindow(
    db,
    windowStart,
    lookaheadEnd,
    candidateIds ?? undefined,
  );
  const riderRoute = await getRoute(origin, destination);
  const riderRoutePoints = riderRoute.polyline ? decodePolyline(riderRoute.polyline) : [];
  const stopsByRide = await fetchStopsByRide(
    db,
    candidateRides.map((r) => r.id),
  );
  const maxDeviationM = deriveMaxDeviationM(origin, destination);

  const built: MatchCandidate[] = [];
  for (const ride of candidateRides) {
    const candidate = buildEndpointCandidate(ride, input, {
      origin,
      destination,
      riderRoutePoints,
      stopsByRide,
      pickupRadiusM: thresholds.widePickupRadiusM,
      dropoffRadiusM: thresholds.wideDropoffRadiusM,
      maxDeviationM,
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

export type SearchTier =
  | 'exact'
  | 'wide_corridor'
  | 'route_passthrough'
  | 'detour_match'
  | 'closest_departure'
  | 'none';

export interface SearchResult {
  /** Describes which discovery mechanism(s) actually populated `candidates`
   *  — kept for the top banner message and for analytics, but (matching-
   *  engine architecture plan §D/§Decisions) no longer decides *which*
   *  candidates are shown or in what order: `candidates` can genuinely mix
   *  `matchType: 'endpoint'` and `'route_passthrough'` results in one
   *  ranked list. `'exact'` means at least one candidate is within the
   *  tight radius/time window; `'wide_corridor'`/`'route_passthrough'`
   *  mean the pool is non-empty but nothing qualified as tight. */
  tier: SearchTier;
  /** Ranked per `rankMatchCandidates` — coarse quality bands, comparably-
   *  good candidates ordered by departure-time proximity within a band,
   *  never a manufactured fine-grained total order (§Decisions #3). */
  candidates: MatchCandidate[];
  /** The one candidate genuinely, clearly ahead of every other — never
   *  merely the highest raw score. `null` whenever two or more candidates
   *  share the top quality band: the passenger sees them together and
   *  chooses, rather than the server crowning an arbitrary "winner" among
   *  options that are, in practice, comparably good (§Decisions #3, §M). */
  standoutRideId: string | null;
  /** Server-built, French, honest explanation of why these results aren't
   *  an exact match — null for `tier: 'exact'` (nothing to explain) and for
   *  `tier: 'none'` (mobile's existing notify-me empty state owns that
   *  copy). Keeps every screen that shows search results saying the same
   *  thing about the same tier, rather than each re-deriving its own
   *  "why these results" heuristic (the problem the pre-Phase-13
   *  results.tsx had with its local time-diff banner logic). */
  message: string | null;
}

/** Coarse passenger-facing match quality (matching-engine architecture
 *  plan §Decisions #3): "don't chase a perfect ordering" — two candidates
 *  in the same band are comparably good and should both be shown, not
 *  forced into a manufactured sub-point ranking. Thresholds are a reasoned
 *  HYPOTHESIS against the existing score formulas' own 0..1 range, not yet
 *  calibrated against real outcome data. */
export type MatchBand = 'excellent' | 'good' | 'usable';
const EXCELLENT_BAND_MIN_SCORE = 0.72;
const GOOD_BAND_MIN_SCORE = 0.45;
const BAND_ORDER: Record<MatchBand, number> = { excellent: 0, good: 1, usable: 2 };

export function computeMatchBand(score: number): MatchBand {
  if (score >= EXCELLENT_BAND_MIN_SCORE) return 'excellent';
  if (score >= GOOD_BAND_MIN_SCORE) return 'good';
  return 'usable';
}

/**
 * Passenger-oriented ranking (matching-engine architecture plan §D,
 * §Decisions #3): sorts by quality band first, then by departure-time
 * proximity to the request within a band — a simple, stable, honest
 * tie-break, not a precision contest between two candidates that are, in
 * practice, both good options. Also decides the single genuine "standout"
 * match, if any: only when it's the sole occupant of the top band actually
 * present in this result set, never merely the top scorer within a tie.
 */
export function rankMatchCandidates(
  candidates: MatchCandidate[],
  input: MatchingSearchInput,
): { ranked: MatchCandidate[]; standoutRideId: string | null } {
  const ranked = [...candidates].sort((a, b) => {
    const bandDiff = BAND_ORDER[computeMatchBand(a.score)] - BAND_ORDER[computeMatchBand(b.score)];
    if (bandDiff !== 0) return bandDiff;
    return (
      Math.abs(a.departureAt.getTime() - input.when.getTime()) -
      Math.abs(b.departureAt.getTime() - input.when.getTime())
    );
  });
  if (ranked.length === 0) return { ranked, standoutRideId: null };

  const topBand = computeMatchBand(ranked[0]!.score);
  const topBandCount = ranked.filter((c) => computeMatchBand(c.score) === topBand).length;
  return { ranked, standoutRideId: topBandCount === 1 ? ranked[0]!.rideId : null };
}

/** Merges two candidate lists for the same search into one, deduplicated by
 *  `rideId` — a ride can in principle qualify for both the endpoint and
 *  route-passthrough retrieval mechanisms at once (e.g. its own endpoints
 *  roughly match *and* its route also passes through the corridor); when
 *  that happens, the higher-scored representation wins, since both
 *  describe the same real candidate ride. */
export function mergeCandidatesByRide(...lists: MatchCandidate[][]): MatchCandidate[] {
  const byRideId = new Map<string, MatchCandidate>();
  for (const list of lists) {
    for (const candidate of list) {
      const existing = byRideId.get(candidate.rideId);
      if (!existing || candidate.score > existing.score) byRideId.set(candidate.rideId, candidate);
    }
  }
  return [...byRideId.values()];
}

/** Whether a candidate would have qualified under the old, pre-merge
 *  "exact" tier's tight radius/time window — used only to decide the
 *  top-level `tier`/`message` a passenger sees, never to gate which
 *  candidates are returned (that gating is exactly what this phase
 *  retires). Recomputes distance from the already-stored walk-minutes
 *  fields (`distanceM = walkMinutes * WALK_SPEED_M_PER_MIN`) rather than
 *  adding a redundant raw-distance field to `MatchCandidate`. */
function isWithinTightBounds(
  candidate: MatchCandidate,
  input: MatchingSearchInput,
  thresholds: MatchingThresholds,
): boolean {
  if (candidate.matchType !== 'endpoint') return false;
  const pickupDistanceM = candidate.pickupWalkMinutes * WALK_SPEED_M_PER_MIN;
  const dropoffDistanceM = candidate.dropoffWalkMinutes * WALK_SPEED_M_PER_MIN;
  const timeDeltaMin = Math.abs(candidate.departureAt.getTime() - input.when.getTime()) / 60_000;
  return (
    pickupDistanceM <= thresholds.tightPickupRadiusM &&
    dropoffDistanceM <= thresholds.tightDropoffRadiusM &&
    timeDeltaMin <= TIGHT_TIME_WINDOW_MIN
  );
}

function classifyOverallTier(
  candidates: MatchCandidate[],
  input: MatchingSearchInput,
  thresholds: MatchingThresholds,
): 'exact' | 'wide_corridor' | 'route_passthrough' {
  if (candidates.some((c) => isWithinTightBounds(c, input, thresholds))) return 'exact';
  if (candidates.some((c) => c.matchType === 'endpoint')) return 'wide_corridor';
  return 'route_passthrough';
}

const TIER_MESSAGES: Record<
  'wide_corridor' | 'route_passthrough' | 'detour_match' | 'closest_departure',
  string
> = {
  wide_corridor:
    "Aucun trajet exactement à l'heure demandée près de vous. Voici les correspondances les plus proches.",
  route_passthrough: 'Ces conducteurs passent par votre trajet en cours de route.',
  detour_match:
    'Ces conducteurs pourraient vous prendre avec un léger détour — demande à confirmer avec le conducteur.',
  closest_departure:
    "Aucun trajet sur cet itinéraire à l'heure demandée. Voici le départ le plus proche.",
};

/**
 * The unified search pipeline (matching-engine architecture plan §D,
 * revising docs/roadmap/phase-13-search-engine.md's original cascade):
 * discovery mechanisms no longer gate what a passenger sees. Stage A —
 * endpoint-radius and route-passthrough retrieval — always runs, in
 * parallel (both are cheap: passthrough reuses each candidate ride's
 * already-stored polyline, no extra routing call), merged into one
 * quality-banded ranked list, exactly the fix for "a mediocre exact match
 * always beat an excellent pass-through match" this phase exists for.
 * `detour_match`/`closest_departure` stay cost-gated *expansions* —
 * detour's real per-candidate routing calls and closest-departure's
 * 14-day lookahead only ever run when Stage A is genuinely empty, the same
 * "show some rides, better than nothing" guarantee the old cascade made,
 * just no longer split into a separate exact/wide pass first.
 */
export async function searchRides(db: Database, input: MatchingSearchInput): Promise<SearchResult> {
  // Profile-scaled once per search (matching-engine architecture plan §G) —
  // every tier below uses these instead of the old flat module-level
  // constants. A mid-length ("urban") request is numerically unaffected;
  // see deriveMatchingThresholds's own doc comment.
  const thresholds = deriveMatchingThresholds(input);

  const [endpointCandidates, passThroughCandidates, inProgressCandidates] = await Promise.all([
    scoreCandidates(
      db,
      input,
      thresholds.widePickupRadiusM,
      thresholds.wideDropoffRadiusM,
      WIDE_TIME_WINDOW_MIN,
    ),
    scorePassThroughCandidates(db, input, thresholds, WIDE_TIME_WINDOW_MIN),
    // M-091/EDGE-050: a trip already in progress is matchable against the
    // driver's current position and remaining route — merged in alongside
    // the other two retrieval mechanisms rather than gated as a separate
    // fallback tier, since a genuinely feasible in-progress match is a real,
    // ordinary result, not a degraded last resort.
    scoreInProgressCandidates(db, input, WIDE_TIME_WINDOW_MIN),
  ]);
  const merged = mergeCandidatesByRide(endpointCandidates, passThroughCandidates, inProgressCandidates);

  if (merged.length > 0) {
    const { ranked, standoutRideId } = rankMatchCandidates(merged, input);
    const tier = classifyOverallTier(ranked, input, thresholds);
    return {
      tier,
      candidates: ranked,
      standoutRideId,
      message: tier === 'exact' ? null : TIER_MESSAGES[tier],
    };
  }

  // M-085/M-085a (spec §28): the admin-configurable override, resolved only
  // here (Stage A already returned nothing, the one real consumer of this
  // value) rather than unconditionally on every search — same "don't pay
  // for a config read the common case never needs" discipline the rest of
  // this cascade already follows for detour's own routing calls.
  const operationalConfig = await getActiveOperationalConfig(db);
  const detour = await scoreDetourCandidates(
    db,
    input,
    WIDE_TIME_WINDOW_MIN,
    thresholds,
    operationalConfig.maxDetourRatio,
  );
  if (detour.length > 0) {
    const { ranked, standoutRideId } = rankMatchCandidates(detour, input);
    return { tier: 'detour_match', candidates: ranked, standoutRideId, message: TIER_MESSAGES.detour_match };
  }

  // closest_departure stays sorted strictly by time-proximity to the
  // request, not band-ranked — that ordering IS its entire point,
  // unchanged from the original cascade.
  const closest = await findClosestDepartures(db, input, thresholds);
  if (closest.length > 0) {
    return {
      tier: 'closest_departure',
      candidates: closest,
      standoutRideId: null,
      message: TIER_MESSAGES.closest_departure,
    };
  }

  return { tier: 'none', candidates: [], standoutRideId: null, message: null };
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
