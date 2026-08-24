import { and, asc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { getDatabase } from '../../lib/database.js';
import { routeStops, rides } from '../../db/schema/index.js';
import { cached } from '../../lib/cache.js';
import { getRedis } from '../../lib/redis.js';
import { getLogger } from '../../config/logger.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
import { nearestRoad, getRouteWithSpeedProfile, type RoutePoint } from '../../lib/routing.js';
import { reverseGeocode } from '../geocoding/geocoding.service.js';
import { OVERLAP_CORRIDOR_WIDTH_M } from '../matching/matching.service.js';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { classifyTripProfile, type TripProfile } from '@vaya/domain';

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
}

export interface CandidateScoringResult {
  accepted: boolean;
  rejectReason?: 'road_class' | 'max_deviation';
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
 */
export function scoreStopCandidate(input: CandidateScoringInput): CandidateScoringResult {
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

        const scored = scoreStopCandidate({ deviationMeters, deviationSeconds, roadClass, hasLabel });
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
}

async function getDriverOwnedRideOrThrow(db: Database, rideId: string, userId: string) {
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
    return { stops: [], osrmUnavailable: true, regenerated: false };
  }

  const hash = hashPolyline(ride.routePolyline);
  const redis = getRedis();
  const hashKey = `route-stops:ride-hash:${rideId}`;

  const existing = await db.query.routeStops.findMany({
    where: eq(routeStops.rideId, rideId),
    orderBy: asc(routeStops.sequence),
  });

  const storedHash = redis ? await redis.get(hashKey) : null;
  if (existing.length > 0 && storedHash === hash) {
    return { stops: existing, osrmUnavailable: false, regenerated: false };
  }

  const candidates = await computeCandidatesForRoute(
    { lat: ride.originLat, lng: ride.originLng },
    { lat: ride.destinationLat, lng: ride.destinationLng },
    ride.routePolyline,
  );

  if (candidates === null) {
    // Transient OSRM outage — keep serving whatever was already generated
    // rather than wiping valid stops because of an unrelated infra blip.
    return { stops: existing, osrmUnavailable: true, regenerated: false };
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

  return { stops: inserted, osrmUnavailable: false, regenerated: true };
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

export interface CustomStopInput {
  label: string;
  lat: number;
  lng: number;
  /** A pickup pin sits near the ride's origin, so it must sort before
   *  every generated candidate; a dropoff pin sits near the destination,
   *  so it sorts after all of them — sequence is what listSelectedRideStops'
   *  route-order-based consumers (ride-details.tsx's timeline, the
   *  driver's own stop list) rely on for correct ordering. */
  role: 'pickup' | 'dropoff';
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

/**
 * Persists a freehand pickup/dropoff pin that didn't match any generated
 * route_stop candidate — Publish Explorer spec §7's "place it yourself"
 * path. Without this, a custom pin was display-only local state that
 * vanished the moment the driver left the publish screen: absent from the
 * ride's own stop list, invisible to the passenger matching/booking flow
 * (which reads route_stops, not the driver's ephemeral publish-screen
 * state), and absent from the driver's own ride-hub screen. Marked
 * `isDriverSelected: true` immediately — a custom pin the driver just
 * placed and confirmed IS the offer, there's no separate "generated, not
 * yet chosen" state for it the way there is for route-sampled candidates.
 */
export async function addCustomStop(
  db: Database,
  rideId: string,
  userId: string,
  input: CustomStopInput,
): Promise<RouteStopRow> {
  await getDriverOwnedRideOrThrow(db, rideId, userId);

  const existing = await db.query.routeStops.findMany({
    where: eq(routeStops.rideId, rideId),
  });
  const sequence = computeCustomStopSequence(
    existing.map((s) => s.sequence),
    input.role,
  );

  const [inserted] = await db
    .insert(routeStops)
    .values({
      rideId,
      sequence,
      label: input.label,
      lat: input.lat,
      lng: input.lng,
      roadSnapped: false,
      deviationMeters: 0,
      deviationSeconds: 0,
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
