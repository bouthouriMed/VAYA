import { and, asc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { getDatabase } from '../../lib/database.js';
import { routeStops, rides } from '../../db/schema/index.js';
import { cached } from '../../lib/cache.js';
import { getRedis } from '../../lib/redis.js';
import { getLogger } from '../../config/logger.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
import { nearestRoad, getRouteWithSpeedProfile, type RoutePoint } from '../../lib/routing.js';
import { decodePolyline, projectPointOntoRoute, type LatLng } from '../../lib/polyline.js';
import { reverseGeocode } from '../geocoding/geocoding.service.js';
import { OVERLAP_CORRIDOR_WIDTH_M } from '../matching/matching.service.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import {
  classifyTripProfile,
  VIA_STOP_DETOUR_BUDGET,
  type TripProfile,
  type TripProfileType,
} from '@vaya/domain';

type Database = ReturnType<typeof getDatabase>;
type RouteStopRow = typeof routeStops.$inferSelect;

// --- Tunable constants ---------------------------------------------------
// See docs/domain/ride-engine.md ("Candidate stop generation — algorithm")
// for the design these implement.

/** Sample the route roughly every 1km — a middle ground within the design
 *  doc's proposed 800m-1.2km range. This is the "urban" trip profile's
 *  value (@vaya/domain's `classifyTripProfile`) and the default for direct
 *  callers of `sampleRoutePoints` (e.g. unit tests); `computeCandidatesForRoute`
 *  below derives the actual interval it uses per-route from the route's own
 *  length instead of this fixed constant — a short commute samples more
 *  densely, a long intercity haul more sparsely. */
export const SAMPLE_INTERVAL_M = 1000;

/** Reject candidates whose driver detour exceeds either threshold outright
 *  — never just downranked (docs/domain/ride-engine.md's business rule). */
export const MAX_DEVIATION_METERS = 300;
export const MAX_DEVIATION_SECONDS = 120;

/** Approximate speed while detouring off-route to serve a stop — slower
 *  than open-road cruising since it includes slowing down, pulling over,
 *  and re-merging. Used only to convert a detour distance into a detour
 *  time estimate. */
const DETOUR_SPEED_M_PER_S = 6; // ~22 km/h

/** Top N candidates returned to the driver, per docs/domain/ride-engine.md
 *  ("proposed N=6-10"). This is the "urban" trip profile's value and the
 *  default for direct callers of `clusterAndRank`; `computeCandidatesForRoute`
 *  derives the actual cap per-route from `classifyTripProfile` instead. */
export const MAX_CANDIDATES = 8;

// --- Road classification --------------------------------------------------

export type RoadClass = 'motorway' | 'primary' | 'secondary' | 'residential' | 'unknown';

/** Road classes a driver should never be asked to stop on (unsafe — no
 *  guaranteed shoulder, high-speed traffic). */
const REJECTED_ROAD_CLASSES: ReadonlySet<RoadClass> = new Set(['motorway']);

// --- Pedestrian-zone / no-stopping-feasibility (M-014/M-015) ---------------
// docs/unified_driver_and_passenger_journey.md §4.1: "Recommended pickup
// points must not be in pedestrian-only areas" (M-014) / "must not be
// operationally unsuitable / vehicle cannot stop" (M-015). Two distinct,
// independently real signals — deliberately not conflated into one check:

/** M-014: a conservative allowlist of OSM `class`/`type` tag combinations
 *  that mean "no vehicle is ever allowed here", per real OpenStreetMap
 *  tagging conventions (https://wiki.openstreetmap.org/wiki/Key:highway,
 *  Key:leisure, Key:place, Key:natural). Deliberately an allowlist, not a
 *  denylist — an unrecognized or missing tag combination is never treated
 *  as pedestrian-only ("classify, don't guess", the same discipline
 *  nominatim.provider.ts's mapNominatimTypeToLocationType already applies).
 *  `living_street` is intentionally excluded — it still permits vehicles,
 *  just with pedestrian priority. Only real for the Nominatim provider
 *  (Google carries no equivalent tag — see LocationPoint.osmClass's doc
 *  comment); a null/undefined class or type never rejects.
 */
export function isPedestrianOnlyLocation(
  osmClass: string | null | undefined,
  osmType: string | null | undefined,
): boolean {
  if (!osmClass) return false;
  if (osmClass === 'highway') {
    return ['pedestrian', 'footway', 'path', 'steps', 'cycleway', 'bridleway', 'elevator'].includes(
      osmType ?? '',
    );
  }
  if (osmClass === 'leisure') {
    return ['park', 'garden', 'pitch', 'playground', 'nature_reserve'].includes(osmType ?? '');
  }
  if (osmClass === 'place') return osmType === 'square';
  if (osmClass === 'natural') return true; // beach, water, wood, ... — never vehicle-accessible.
  if (osmClass === 'landuse') {
    return ['forest', 'meadow', 'grass', 'recreation_ground', 'cemetery'].includes(osmType ?? '');
  }
  return false;
}

/** M-015: "operationally unsuitable / vehicle cannot stop" — distinct from
 *  M-014's tag-based check and from MAX_DEVIATION_METERS's *economic*
 *  "is this detour worth it" threshold. This is the *physical* question:
 *  can a vehicle plausibly reach and stop anywhere near this point at all?
 *  OSRM's `/nearest/v1/driving/...` (lib/routing.ts's nearestRoad) only
 *  ever snaps to a road actually in the driving graph — a large one-way
 *  snap distance is real, live evidence the queried point itself has no
 *  nearby vehicle access (open countryside, a large park interior, water),
 *  independent of whether any OSM tag confirms why.
 *
 *  Set to the same 2000m boundary addCustomStop's 'via' branch already used
 *  to decide whether to bother snapping the display coordinate at all
 *  (previously: silently kept the unsnapped point beyond it, with no
 *  rejection at all) — formalized here as an actual hard rejection instead,
 *  the real M-015 gap this pass closes. A point genuinely ~2km from any
 *  drivable road is exactly "vehicle cannot stop here"; a few hundred
 *  meters is not — common and fine for a geocoded town-square centroid
 *  whose real OSM point can legitimately sit that far from the nearest
 *  road segment in this routing graph without anything being wrong. */
export const MAX_STOP_ACCESS_METERS = 2000;

export function exceedsStopAccessDistance(
  snapDistanceM: number,
  maxM: number = MAX_STOP_ACCESS_METERS,
): boolean {
  return snapDistanceM > maxM;
}

const ROAD_CLASS_SUITABILITY: Record<RoadClass, number> = {
  motorway: 0, // rejected outright before this is consulted
  primary: 0.7,
  secondary: 1,
  residential: 0.6,
  unknown: 0.45,
};

/**
 * Classifies a road segment from its local travel speed.
 *
 * Deviation from docs/domain/ride-engine.md's literal wording ("road class
 * from OSRM's `nearest` response, which includes way metadata"): verified
 * directly against this deployment's live OSRM instance that neither
 * `/nearest` nor `/route` expose a way-class tag in their responses (the
 * default `car.lua` profile here doesn't emit a `classes` field either
 * service). Sustained local speed — genuinely available from `/route`'s
 * `annotations=true` output — is the best available proxy for "is this a
 * limited-access/motorway-grade road" without standing up a second data
 * source or a custom OSRM profile. This is a stated v1 limitation,
 * consistent with the design doc's own admission that road-class signals
 * here are a strong prior, not ground truth.
 */
export function classifyRoadSpeed(speedMPerS: number | null): RoadClass {
  if (speedMPerS === null) return 'unknown';
  if (speedMPerS >= 25) return 'motorway'; // ~90+ km/h sustained
  if (speedMPerS >= 16) return 'primary'; // ~58+ km/h — arterial road
  if (speedMPerS >= 8) return 'secondary'; // ~29+ km/h — normal street
  return 'residential';
}

// --- Sampling --------------------------------------------------------------

export interface RouteSample {
  point: RoutePoint;
  sequence: number;
  /** Local speed of the route segment this sample falls on, m/s, or null
   *  if unavailable. */
  segmentSpeedMPerS: number | null;
}

/**
 * Walks a decoded route polyline and emits a sample roughly every
 * `intervalM` by cumulative distance, skipping the immediate vicinity of
 * the route's own start and end (those are the ride's origin/destination
 * already — not new candidate stops). Pure and synchronous — no OSRM
 * calls — so it's directly unit-testable against fixed synthetic
 * polylines.
 */
export function sampleRoutePoints(
  points: RoutePoint[],
  segmentSpeedsMPerS: number[],
  intervalM: number = SAMPLE_INTERVAL_M,
): RouteSample[] {
  if (points.length < 2) return [];

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = haversineDistanceMeters(points[i]!, points[i + 1]!);
    segmentLengths.push(len);
    totalLength += len;
  }
  if (totalLength === 0) return [];

  const edgeMarginM = Math.min(intervalM * 0.5, totalLength / 4);
  const samples: RouteSample[] = [];
  let sequence = 0;

  for (let dist = intervalM; dist < totalLength - edgeMarginM; dist += intervalM) {
    let covered = 0;
    let segmentIndex = 0;
    while (
      segmentIndex < segmentLengths.length - 1 &&
      covered + segmentLengths[segmentIndex]! < dist
    ) {
      covered += segmentLengths[segmentIndex]!;
      segmentIndex++;
    }
    const segLen = segmentLengths[segmentIndex]!;
    const t = segLen === 0 ? 0 : (dist - covered) / segLen;
    const a = points[segmentIndex]!;
    const b = points[segmentIndex + 1]!;
    samples.push({
      point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
      sequence: sequence++,
      segmentSpeedMPerS: segmentSpeedsMPerS[segmentIndex] ?? null,
    });
  }

  return samples;
}

/** Total length of a decoded polyline — used purely to classify a ride's
 *  trip profile (@vaya/domain's `classifyTripProfile`) without a second
 *  OSRM round-trip: the ride's own stored `routePolyline` already has
 *  everything needed. */
export function polylineDistanceMeters(points: RoutePoint[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistanceMeters(points[i]!, points[i + 1]!);
  }
  return total;
}

// --- Deviation cost ----------------------------------------------------

export interface DeviationCost {
  deviationMeters: number;
  deviationSeconds: number;
}

/** The OSRM `nearest` snap distance is (approximately) the one-way detour
 *  off the route line; doubled for a there-and-back detour cost. */
export function computeDeviationCost(snapDistanceM: number): DeviationCost {
  const deviationMeters = Math.round(snapDistanceM * 2);
  const deviationSeconds = Math.round(deviationMeters / DETOUR_SPEED_M_PER_S);
  return { deviationMeters, deviationSeconds };
}

// --- Scoring -----------------------------------------------------------

export interface CandidateScoringInput {
  deviationMeters: number;
  deviationSeconds: number;
  roadClass: RoadClass;
  hasLabel: boolean;
  /** One-way distance from the raw candidate point to the nearest real
   *  drivable road (lib/routing.ts's nearestRoad snapDistanceM, pre-
   *  doubling) — M-015's physical access check. Optional/undefined only
   *  for pre-existing call sites that predate this field; treated as "no
   *  signal, don't reject" the same as a null osmClass/osmType below. */
  snapDistanceM?: number;
  /** M-014's real, currently-Nominatim-only tag signal — see
   *  isPedestrianOnlyLocation's doc comment. */
  osmClass?: string | null;
  osmType?: string | null;
}

export interface CandidateScoringResult {
  accepted: boolean;
  rejectReason?: 'road_class' | 'max_deviation' | 'pedestrian_zone' | 'no_stopping_feasibility';
  suitabilityScore: number;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Pure scoring/rejection function — the core of what the roadmap flags as
 * "the highest-uncertainty part of the whole roadmap" (docs/roadmap/
 * phase-04-ride-engine-driver-stops.md). Deliberately isolated from any
 * OSRM/network call so it's directly unit-testable with fixed synthetic
 * inputs, and so its weights can be revisited later from real driver
 * usage (the analytics events this phase adds exist specifically to make
 * that revision possible) without touching the I/O plumbing around it.
 *
 * Rejection order (M-014/M-015 added this pass, checked before the
 * pre-existing road_class/max_deviation rules): a tag-confirmed pedestrian
 * zone is the strongest, most specific signal available, so it's checked
 * first; then physical stop-access distance (a much tighter radius than
 * the economic max-deviation threshold further down); then the pre-
 * existing road-class/deviation rules, unchanged.
 */
export function scoreStopCandidate(input: CandidateScoringInput): CandidateScoringResult {
  if (isPedestrianOnlyLocation(input.osmClass, input.osmType)) {
    return { accepted: false, rejectReason: 'pedestrian_zone', suitabilityScore: 0 };
  }
  if (input.snapDistanceM !== undefined && exceedsStopAccessDistance(input.snapDistanceM)) {
    return { accepted: false, rejectReason: 'no_stopping_feasibility', suitabilityScore: 0 };
  }
  if (REJECTED_ROAD_CLASSES.has(input.roadClass)) {
    return { accepted: false, rejectReason: 'road_class', suitabilityScore: 0 };
  }
  if (
    input.deviationMeters > MAX_DEVIATION_METERS ||
    input.deviationSeconds > MAX_DEVIATION_SECONDS
  ) {
    return { accepted: false, rejectReason: 'max_deviation', suitabilityScore: 0 };
  }

  const deviationScore = clamp01(1 - input.deviationMeters / MAX_DEVIATION_METERS);
  const roadClassScore = ROAD_CLASS_SUITABILITY[input.roadClass];
  const labelScore = input.hasLabel ? 1 : 0.35;

  const suitabilityScore = clamp01(deviationScore * 0.5 + roadClassScore * 0.3 + labelScore * 0.2);
  return { accepted: true, suitabilityScore };
}

// --- Clustering ----------------------------------------------------------

export interface ScoredStopCandidate {
  sequence: number;
  label: string;
  lat: number;
  lng: number;
  roadSnapped: boolean;
  deviationMeters: number;
  deviationSeconds: number;
  suitabilityScore: number;
  roadClass: RoadClass;
}

/**
 * Merges candidates within `mergeRadiusM` of each other — reusing
 * matching.service.ts's `OVERLAP_CORRIDOR_WIDTH_M` for the same "how close
 * counts as the same place" concept rather than introducing a second magic
 * number for it, per the phase's explicit business rule — keeping the
 * highest-scored representative of each cluster, then caps the result at
 * `maxCount`. Pure — no I/O — unit-tested directly.
 */
export function clusterAndRank(
  candidates: ScoredStopCandidate[],
  mergeRadiusM: number = OVERLAP_CORRIDOR_WIDTH_M,
  maxCount: number = MAX_CANDIDATES,
): ScoredStopCandidate[] {
  const bySuitability = [...candidates].sort((a, b) => b.suitabilityScore - a.suitabilityScore);
  const kept: ScoredStopCandidate[] = [];

  for (const candidate of bySuitability) {
    const tooClose = kept.some((k) => haversineDistanceMeters(candidate, k) <= mergeRadiusM);
    if (!tooClose) kept.push(candidate);
  }

  return kept
    .slice(0, maxCount)
    .sort((a, b) => a.sequence - b.sequence)
    .map((c, i) => ({ ...c, sequence: i }));
}

// --- Orchestration: route -> candidates (cacheable, ride-independent) -----

function hashPolyline(polyline: string): string {
  return createHash('sha1').update(polyline).digest('hex').slice(0, 20);
}

const CANDIDATE_CACHE_TTL_SEC = 3600;
/** How long a ride's "already generated for this exact route" marker is
 *  kept — long-lived since a ride's route rarely changes after creation,
 *  well beyond any single publish session. */
const RIDE_HASH_TTL_SEC = 30 * 24 * 3600;

async function buildLabel(nearest: { name: string; lat: number; lng: number }): Promise<string> {
  if (nearest.name.trim().length > 0) return nearest.name;
  try {
    const reverse = await reverseGeocode(nearest.lat, nearest.lng);
    return reverse.label;
  } catch (err) {
    getLogger().warn({ err }, 'Reverse geocode failed while labeling a stop candidate');
    return 'Point sur la route';
  }
}

/**
 * Runs the full sample -> snap -> score -> cluster pipeline for a route,
 * independent of any specific ride (so two rides sharing the same route
 * reuse the same computation — cached by a hash of the polyline, per
 * docs/domain/ride-engine.md). Returns null when OSRM is unavailable (no
 * route/speed profile to sample from) — callers must treat that as "skip
 * generation, fall back to origin/destination only"
 * (docs/domain/ride-engine.md's OSRM-unavailable edge case). Never cached
 * on the null path, since that's a transient condition, not a property of
 * the route itself.
 */
export async function computeCandidatesForRoute(
  origin: RoutePoint,
  destination: RoutePoint,
  routePolyline: string,
): Promise<ScoredStopCandidate[] | null> {
  const annotated = await getRouteWithSpeedProfile(origin, destination);
  if (!annotated) return null;

  // Route-length-aware tuning (@vaya/domain's classifyTripProfile): a short
  // commute samples more densely with a tighter merge radius (little room
  // to spread candidates apart), while a long intercity haul samples more
  // sparsely (a driver won't detour every km on a highway leg) but is
  // allowed more total candidates overall, since it passes through more
  // distinct towns worth offering as a stop. Cache key includes the profile
  // type so a route whose distance later crosses a threshold (shouldn't
  // happen for an already-generated ride, but keeps the cache honest) never
  // serves stale candidates tuned for the wrong profile.
  const profile: TripProfile = classifyTripProfile(annotated.distanceM);

  const hash = hashPolyline(routePolyline);
  return cached(
    `route-stops:candidates:v2:${profile.type}:${hash}`,
    CANDIDATE_CACHE_TTL_SEC,
    async () => {
      const samples = sampleRoutePoints(
        annotated.points,
        annotated.segmentSpeedsMPerS,
        profile.sampleIntervalM,
      );

      const raw: ScoredStopCandidate[] = [];
      for (const sample of samples) {
        const nearest = await nearestRoad(sample.point);
        if (!nearest) continue; // couldn't snap — water, out of coverage, etc.

        const roadClass = classifyRoadSpeed(sample.segmentSpeedMPerS);
        const { deviationMeters, deviationSeconds } = computeDeviationCost(nearest.snapDistanceM);
        const hasLabel = nearest.name.trim().length > 0;

        // No per-sample reverse-geocode here (osmClass/osmType omitted,
        // i.e. no pedestrian-zone signal available) — a route-sampled point
        // is by construction already a point ON the OSRM-computed driving
        // route, so it's virtually never genuinely pedestrian-only; adding
        // a Nominatim call per sample (potentially dozens per route) would
        // be a real, unjustified rate-limit/latency cost for a case that
        // essentially never fires here. M-014's real check applies to
        // addCustomStop below, where a driver freely places an arbitrary
        // point. M-015's snapDistanceM check still applies uniformly (free
        // — nearest is already fetched for deviation cost).
        const scored = scoreStopCandidate({
          deviationMeters,
          deviationSeconds,
          roadClass,
          hasLabel,
          snapDistanceM: nearest.snapDistanceM,
        });
        if (!scored.accepted) continue;

        raw.push({
          sequence: sample.sequence,
          label: await buildLabel(nearest),
          lat: nearest.lat,
          lng: nearest.lng,
          roadSnapped: true,
          deviationMeters,
          deviationSeconds,
          suitabilityScore: scored.suitabilityScore,
          roadClass,
        });
      }

      return clusterAndRank(raw, profile.mergeRadiusM, profile.maxCandidates);
    },
  );
}

// --- Orchestration: ride-scoped generation + persistence ------------------

export interface GenerateStopsResult {
  stops: RouteStopRow[];
  /** True when OSRM was unreachable for this attempt — the driver should
   *  see an honest "detailed stop suggestions unavailable right now"
   *  message, never fabricated candidates. */
  osrmUnavailable: boolean;
  /** False when this call returned already-generated stops for an
   *  unchanged route (the idempotent fast path). */
  regenerated: boolean;
  /** Which `classifyTripProfile` bucket this route falls into — lets the
   *  mobile "add stops along your route" step frame its copy and map
   *  camera appropriately for a short in-town hop vs. a long intercity
   *  haul, instead of showing one fixed script for every trip length.
   *  Derived straight from the route's own polyline length (no OSRM call
   *  needed), so it's available on both the freshly-generated and the
   *  already-generated/cached-hit paths below. Null only when the ride has
   *  no route yet at all. */
  tripProfileType: TripProfileType | null;
}

export async function getDriverOwnedRideOrThrow(db: Database, rideId: string, userId: string) {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, rideId),
    with: { driverProfile: true },
  });
  if (!ride) throw new NotFoundError('Ride');
  if (ride.driverProfile.userId !== userId) {
    throw new ForbiddenError('Only the driver who created this ride can manage its stops');
  }
  return ride;
}

/**
 * Generates (or returns already-generated) candidate stops for a ride.
 *
 * Idempotency / invalidation (docs/domain/ride-engine.md: "route changes
 * after generation invalidate cached candidates"): the schema in that doc
 * has no `route_stops.source_polyline_hash` column, so this tracks "which
 * route these stops were generated for" as a Redis key
 * (`route-stops:ride-hash:{rideId}` -> polyline hash), a natural extension
 * of the same "cache candidate generation" role `lib/cache.ts` already
 * serves rather than a second mechanism. A call whose stored hash matches
 * the ride's current `routePolyline` is a no-op read; a mismatch (or first
 * call) deletes any stale rows and regenerates. When Redis isn't
 * configured, generation always re-runs — a correctness-safe degradation
 * (stale rows are still replaced, just without the fast path).
 */
export async function generateCandidateStopsForRide(
  db: Database,
  rideId: string,
  userId: string,
): Promise<GenerateStopsResult> {
  const ride = await getDriverOwnedRideOrThrow(db, rideId, userId);

  if (!ride.routePolyline) {
    return { stops: [], osrmUnavailable: true, regenerated: false, tripProfileType: null };
  }

  const tripProfileType = classifyTripProfile(
    polylineDistanceMeters(decodePolyline(ride.routePolyline)),
  ).type;

  const hash = hashPolyline(ride.routePolyline);
  const redis = getRedis();
  const hashKey = `route-stops:ride-hash:${rideId}`;

  const existing = await db.query.routeStops.findMany({
    where: eq(routeStops.rideId, rideId),
    orderBy: asc(routeStops.sequence),
  });

  const storedHash = redis ? await redis.get(hashKey) : null;
  if (existing.length > 0 && storedHash === hash) {
    return { stops: existing, osrmUnavailable: false, regenerated: false, tripProfileType };
  }

  const candidates = await computeCandidatesForRoute(
    { lat: ride.originLat, lng: ride.originLng },
    { lat: ride.destinationLat, lng: ride.destinationLng },
    ride.routePolyline,
  );

  if (candidates === null) {
    // Transient OSRM outage — keep serving whatever was already generated
    // rather than wiping valid stops because of an unrelated infra blip.
    return { stops: existing, osrmUnavailable: true, regenerated: false, tripProfileType };
  }

  if (existing.length > 0) {
    await db.delete(routeStops).where(eq(routeStops.rideId, rideId));
  }

  let inserted: RouteStopRow[] = [];
  if (candidates.length > 0) {
    inserted = await db
      .insert(routeStops)
      .values(candidates.map((c) => ({ rideId, ...c })))
      .returning();
  }

  if (redis) await redis.set(hashKey, hash, 'EX', RIDE_HASH_TTL_SEC);

  return { stops: inserted, osrmUnavailable: false, regenerated: true, tripProfileType };
}

export interface StopSelectionInput {
  stopId: string;
  isDriverSelected: boolean;
}

/** Driver's final selection of which generated candidates to actually
 *  offer. Never requires a non-empty selection — origin/destination alone
 *  remains a valid ride (docs/domain/ride-engine.md's edge case: "Driver
 *  deselects all candidates ... not allowed to require at least one"). */
export async function updateDriverStopSelection(
  db: Database,
  rideId: string,
  userId: string,
  selections: StopSelectionInput[],
): Promise<RouteStopRow[]> {
  await getDriverOwnedRideOrThrow(db, rideId, userId);

  if (selections.length > 0) {
    const ownedStops = await db.query.routeStops.findMany({
      where: eq(routeStops.rideId, rideId),
    });
    const ownedIds = new Set(ownedStops.map((s) => s.id));
    for (const selection of selections) {
      if (!ownedIds.has(selection.stopId)) {
        throw new NotFoundError('Stop');
      }
    }

    await Promise.all(
      selections.map((selection) =>
        db
          .update(routeStops)
          .set({ isDriverSelected: selection.isDriverSelected, updatedAt: new Date() })
          .where(eq(routeStops.id, selection.stopId)),
      ),
    );
  }

  return db.query.routeStops.findMany({
    where: eq(routeStops.rideId, rideId),
    orderBy: asc(routeStops.sequence),
  });
}

// VIA_STOP_DETOUR_BUDGET now lives in @vaya/domain (matching-thresholds.ts)
// — moved out of this module so matching.service.ts's joint-stop-score
// resolution can share the exact same numbers without an apps/api-internal
// circular import between the rides and matching modules (matching.service.ts
// already exports OVERLAP_CORRIDOR_WIDTH_M, imported by this file above).

export interface CustomStopInput {
  label: string;
  lat: number;
  lng: number;
  /** A pickup pin sits near the ride's origin, so it must sort before
   *  every generated candidate; a dropoff pin sits near the destination,
   *  so it sorts after all of them — sequence is what listSelectedRideStops'
   *  route-order-based consumers (ride-details.tsx's timeline, the
   *  driver's own stop list) rely on for correct ordering. 'via' is a
   *  third, later addition: a freehand mid-route stop added from the
   *  "add stops along your route" step, which needs its sequence computed
   *  from its actual position along the road route instead of either
   *  extreme — see `computeViaStopInsertion` below. */
  role: 'pickup' | 'dropoff' | 'via';
}

/** Pure so the ordering rule is directly unit-testable without a DB —
 *  a pickup pin always sorts before every existing stop, a dropoff pin
 *  always sorts after, regardless of how many candidates exist or
 *  whether this is the first custom stop added for the ride. */
export function computeCustomStopSequence(
  existingSequences: number[],
  role: 'pickup' | 'dropoff',
): number {
  return role === 'pickup'
    ? (existingSequences.length > 0 ? Math.min(...existingSequences) : 0) - 1
    : (existingSequences.length > 0 ? Math.max(...existingSequences) : 0) + 1;
}

export interface ViaInsertionCandidate {
  id: string;
  sequence: number;
  /** 0..1 position along the route (`projectPointOntoRoute`'s `fraction`),
   *  precomputed by the caller for every existing stop against the same
   *  decoded route the new point is projected onto. */
  fraction: number;
}

export interface ViaStopInsertion {
  /** The sequence to give the new stop. */
  newSequence: number;
  /** Existing stops that must shift one sequence slot later to make room —
   *  every stop whose current sequence is >= `newSequence`, pickup/dropoff
   *  included, so "pickup first, dropoff last" always holds regardless of
   *  where a via-stop lands between them. */
  bumps: { id: string; sequence: number }[];
}

/**
 * Computes where a freehand mid-route stop belongs among a ride's existing
 * stops, ordered by actual position along the road route rather than
 * insertion order. Pure — takes pre-computed route fractions rather than a
 * route/DB itself — so the ordering logic is directly unit-testable with
 * fixed synthetic fractions, matching this file's existing pattern for
 * `computeCustomStopSequence`/`scoreStopCandidate`/`clusterAndRank`.
 *
 * Existing stops occupy consecutive-ish integer sequences (generated
 * candidates are 0..N-1 in route order; a custom pickup/dropoff sits below/
 * above that range — see `computeCustomStopSequence`). Rather than trying to
 * carve out a fractional slot between two adjacent integers, this always
 * inserts at the *sequence value already held* by the first stop whose
 * fraction is greater than the new point's, and bumps that stop (and every
 * stop after it, transitively — a dropoff pin included) up by one. This
 * keeps sequence values a clean, gap-free integer ordering after every
 * insertion instead of letting them drift into fractions.
 */
export function computeViaStopInsertion(
  existing: ViaInsertionCandidate[],
  pointFraction: number,
): ViaStopInsertion {
  const sortedByFraction = [...existing].sort((a, b) => a.fraction - b.fraction);
  const after = sortedByFraction.find((s) => s.fraction > pointFraction);
  const newSequence = after
    ? after.sequence
    : (sortedByFraction.at(-1)?.sequence ?? -1) + 1;
  const bumps = existing
    .filter((s) => s.sequence >= newSequence)
    .map((s) => ({ id: s.id, sequence: s.sequence + 1 }));
  return { newSequence, bumps };
}

/**
 * Persists a freehand pickup/dropoff/via pin that didn't match any
 * generated route_stop candidate — Publish Explorer spec §7's "place it
 * yourself" path, extended by the "add stops along your route" step for the
 * mid-route ('via') case. Without this, a custom pin was display-only local
 * state that vanished the moment the driver left the publish screen: absent
 * from the ride's own stop list, invisible to the passenger matching/
 * booking flow (which reads route_stops, not the driver's ephemeral
 * publish-screen state), and absent from the driver's own ride-hub screen.
 * Marked `isDriverSelected: true` immediately — a custom pin the driver
 * just placed and confirmed IS the offer, there's no separate "generated,
 * not yet chosen" state for it the way there is for route-sampled
 * candidates.
 */
export async function addCustomStop(
  db: Database,
  rideId: string,
  userId: string,
  input: CustomStopInput,
): Promise<RouteStopRow> {
  const ride = await getDriverOwnedRideOrThrow(db, rideId, userId);

  const existing = await db.query.routeStops.findMany({
    where: eq(routeStops.rideId, rideId),
  });

  // M-014/M-017 (docs/unified_driver_and_passenger_journey.md §4.1,
  // matrix test id A.stop-candidates.reject-pedestrian-zone): a manually-
  // placed point is subject to the exact same feasibility validation as a
  // route-sampled candidate — no bypass, closing the real gap the matrix
  // flagged ("addCustomStop's pickup/dropoff branch skips nearestRoad/
  // feasibility entirely"). Applies to every role (pickup/dropoff/via)
  // uniformly, unlike the pre-existing detour-budget check further below
  // which is 'via'-only by nature (pickup/dropoff aren't scored against
  // route-detour distance, only against real vehicle accessibility).
  // Best-effort: a reverse-geocode failure means "no signal", never a hard
  // rejection — mirrors buildLabel's existing degrade-gracefully pattern.
  let osmClass: string | null = null;
  let osmType: string | null = null;
  try {
    const geocoded = await reverseGeocode(input.lat, input.lng);
    osmClass = geocoded.osmClass;
    osmType = geocoded.osmType;
  } catch (err) {
    getLogger().warn(
      { err, lat: input.lat, lng: input.lng },
      'Reverse geocode failed while validating a custom stop location — proceeding with no pedestrian-zone signal',
    );
  }
  if (isPedestrianOnlyLocation(osmClass, osmType)) {
    throw new AppError(
      'This location is a pedestrian-only area — no vehicle can stop here',
      400,
      'STOP_PEDESTRIAN_ZONE',
    );
  }

  let sequence: number;
  let stopLat = input.lat;
  let stopLng = input.lng;
  let roadSnapped = false;
  let deviationMeters = 0;
  let deviationSeconds = 0;

  if (input.role === 'via') {
    if (!ride.routePolyline) {
      throw new ValidationError('A route is required to add a stop along the route');
    }
    const route: LatLng[] = decodePolyline(ride.routePolyline);
    const projection = projectPointOntoRoute({ lat: input.lat, lng: input.lng }, route);
    const pointFraction = projection.fraction;

    // Real detour validation against the picked place's actual distance
    // from the route — the driver's real commitment ("I'll detour this
    // far"), never trusted from the client. Scaled by trip profile so a
    // genuine city-level detour (a highway exit into a town) is accepted
    // while a wildly off-route point is rejected outright, same "never
    // just downranked" discipline as MAX_DEVIATION_METERS/SECONDS above.
    const tripProfileType = classifyTripProfile(polylineDistanceMeters(route)).type;
    const budget = VIA_STOP_DETOUR_BUDGET[tripProfileType];
    const cost = computeDeviationCost(projection.distanceM);
    if (cost.deviationMeters > budget.maxMeters || cost.deviationSeconds > budget.maxSeconds) {
      throw new AppError(
        'This place is too far from your route for a reasonable detour',
        400,
        'STOP_TOO_FAR_FROM_ROUTE',
      );
    }
    deviationMeters = cost.deviationMeters;
    deviationSeconds = cost.deviationSeconds;

    const existingWithFraction: ViaInsertionCandidate[] = existing.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      fraction: projectPointOntoRoute({ lat: s.lat, lng: s.lng }, route).fraction,
    }));
    const { newSequence, bumps } = computeViaStopInsertion(existingWithFraction, pointFraction);
    if (bumps.length > 0) {
      await Promise.all(
        bumps.map((b) =>
          db
            .update(routeStops)
            .set({ sequence: b.sequence, updatedAt: new Date() })
            .where(eq(routeStops.id, b.id)),
        ),
      );
    }
    sequence = newSequence;
  } else {
    sequence = computeCustomStopSequence(
      existing.map((s) => s.sequence),
      input.role,
    );
  }

  // M-015/M-017: snap to the nearest real drivable road so the stored
  // "exact stop point" is somewhere a car can actually pull over, not a raw
  // geocoded centroid (which can land inside a building or a pedestrian
  // square) — applied uniformly across all three roles now (previously
  // 'via'-only; pickup/dropoff had zero snapping/validation at all, the
  // exact M-017 finding). A point genuinely too far from any drivable road
  // (MAX_STOP_ACCESS_METERS) is rejected outright — real, live evidence no
  // vehicle can reach/stop there — rather than silently accepted unsnapped
  // as before. OSRM unreachable (nearest === null) degrades honestly to
  // the unsnapped input point with no rejection — a transient
  // infrastructure gap is not evidence the location itself is bad.
  const nearest = await nearestRoad({ lat: input.lat, lng: input.lng });
  if (nearest) {
    if (exceedsStopAccessDistance(nearest.snapDistanceM)) {
      throw new AppError(
        'No vehicle can reach or stop near this exact location',
        400,
        'STOP_NOT_VEHICLE_ACCESSIBLE',
      );
    }
    stopLat = nearest.lat;
    stopLng = nearest.lng;
    roadSnapped = true;
  }

  const [inserted] = await db
    .insert(routeStops)
    .values({
      rideId,
      sequence,
      label: input.label,
      lat: stopLat,
      lng: stopLng,
      roadSnapped,
      deviationMeters,
      deviationSeconds,
      suitabilityScore: 1,
      roadClass: null,
      isDriverSelected: true,
    })
    .returning();
  if (!inserted) throw new Error('Failed to insert custom stop');
  return inserted;
}

/** Public/passenger-facing shape: only the driver's actually-selected
 *  stops (docs/domain/ride-engine.md's API surface). */
export async function listSelectedRideStops(db: Database, rideId: string): Promise<RouteStopRow[]> {
  const ride = await db.query.rides.findFirst({ where: eq(rides.id, rideId) });
  if (!ride) throw new NotFoundError('Ride');

  return db.query.routeStops.findMany({
    where: and(eq(routeStops.rideId, rideId), eq(routeStops.isDriverSelected, true)),
    orderBy: asc(routeStops.sequence),
  });
}

/** Internal/driver editing view: every generated candidate, selected or
 *  not, so the driver can revisit and change their offer. */
export async function listRideStopsForDriver(
  db: Database,
  rideId: string,
  userId: string,
): Promise<RouteStopRow[]> {
  await getDriverOwnedRideOrThrow(db, rideId, userId);
  return db.query.routeStops.findMany({
    where: eq(routeStops.rideId, rideId),
    orderBy: asc(routeStops.sequence),
  });
}
