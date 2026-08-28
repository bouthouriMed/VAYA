import { classifyTripProfile, type TripProfileType } from '@vaya/domain';
import { decodePolyline, projectPointOntoRoute, type LatLng } from '../../lib/polyline.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
import { getRedis } from '../../lib/redis.js';
import { queryNearbyPlaces, type OverpassPlace } from '../../lib/overpass.js';
import {
  sampleRoutePoints,
  polylineDistanceMeters,
  getDriverOwnedRideOrThrow,
  VIA_STOP_DETOUR_BUDGET,
} from './stop-candidates.service.js';
import type { getDatabase } from '../../lib/database.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * Real, named cities/towns along a ride's route that a driver can offer as
 * a detour stop — the primary, browsable list this feature is actually
 * about (per direct product feedback: "user should be able to see
 * predefined cities in his route, not manually search... think like
 * BlaBlaCar"). Manual search (addCustomStop's existing 'via' role) is the
 * fallback for a real place this discovery pass didn't surface, not the
 * primary mechanism.
 *
 * Ranked by real OSM population data (via lib/overpass.ts), not just
 * proximity to a route sample — live-verified while building this that
 * proximity-only ranking picks obscure villages over a genuinely major
 * city sitting a little further from the sampled point: searching near
 * the Tarragona-Barcelona corridor, Google Places' Nearby Search (this
 * feature's first implementation) returned a dozen small Llobregat-area
 * towns and never "Barcelona" itself, even at a 20-40km radius — Google's
 * Nearby Search has no population/significance field to rank by at all.
 * Querying the same area via Overpass (OpenStreetMap's free query API)
 * found Barcelona immediately, tagged with its real population
 * (1,713,247) against a few hundred/thousand for the surrounding towns —
 * exactly the signal this feature needs. See lib/overpass.ts's own doc
 * comment for the full live-verified reasoning.
 *
 * Deliberately much coarser sampling than stop-candidates.service.ts's
 * on-route micro-stop generation (which targets ~1km spacing and a tight
 * 300m road-line deviation) — this is discovering distinct SETTLEMENTS a
 * driver might genuinely detour into, not points on the road itself.
 */

const CITY_SAMPLE_INTERVAL_M: Record<TripProfileType, number> = {
  commute: 3000,
  urban: 6000,
  intercity: 12000,
};

/** Hard cap on how many Overpass queries one route scan makes, regardless
 *  of route length — a very long intercity route (e.g. 700km+) would
 *  otherwise generate dozens of samples, each a real network call.
 *  Widens the effective sample interval instead of uncapping the call
 *  count. */
const MAX_CITY_SAMPLES = 24;

/** How far from each route sample to search for real nearby places —
 *  deliberately generous and NOT tied to the sample interval (unlike the
 *  interval itself): a genuinely major city's real "pull" for a detour is
 *  legitimately wider than a small town's, and live testing showed a
 *  city needs to be well within this radius of at least one sample to be
 *  found at all (Overpass has no ranked "search near, ordered by
 *  significance" mode — a place is either inside the query circle or
 *  it's invisible to that query). */
const CITY_SEARCH_RADIUS_M: Record<TripProfileType, number> = {
  commute: 8000,
  urban: 15000,
  intercity: 25000,
};

/** Cities found within this distance of an already-kept one are treated
 *  as the same real place (a route can sample the same city's outskirts
 *  from two different angles/passes) — merge to the highest-scored
 *  occurrence rather than listing near-duplicates. */
export const CITY_MERGE_RADIUS_M = 5000;

const MAX_CITY_CANDIDATES = 8;

const CITY_CANDIDATE_CACHE_TTL_SEC = 3600;

export interface CityDetourCandidate {
  label: string;
  lat: number;
  lng: number;
}

export function cityStopSampleIntervalM(routeLengthM: number, profileType: TripProfileType): number {
  const base = CITY_SAMPLE_INTERVAL_M[profileType];
  const minIntervalForCap = routeLengthM / MAX_CITY_SAMPLES;
  return Math.max(base, minIntervalForCap);
}

/** Real OSM population, log-scaled so a 2M-person city doesn't
 *  completely drown out a real, well-sized 20k town that's otherwise a
 *  perfectly good detour option — but still decisively outranks a
 *  same-radius village of a few hundred people. Untagged (null)
 *  population scores as the smallest real town size (1,000) rather than
 *  zero — many genuinely real, reasonably-sized OSM town/village nodes
 *  simply lack a population tag, and zero would rank them below every
 *  tagged hamlet. */
function populationScore(population: number | null): number {
  return Math.log10(Math.max(population ?? 1000, 1));
}

export function dedupeCities(cities: CityDetourCandidate[], radiusM: number): CityDetourCandidate[] {
  const kept: CityDetourCandidate[] = [];
  for (const city of cities) {
    const isDuplicate = kept.some(
      (k) => k.label === city.label || haversineDistanceMeters(city, k) <= radiusM,
    );
    if (!isDuplicate) kept.push(city);
  }
  return kept;
}

/** Overpass's public mirrors rate-limit bursts of requests from the same
 *  client — live-verified while building this that scanning a real
 *  ~140km route's dozen samples back-to-back with no pacing at all
 *  triggers real 429s partway through, even across the multiple mirrors
 *  lib/overpass.ts now rotates across. A modest delay between samples
 *  (the whole scan is cached afterward, so this cost is paid once per
 *  distinct route, not per request) is the same considerate-load
 *  discipline this codebase already applies to Nominatim elsewhere. */
const OVERPASS_SAMPLE_DELAY_MS = 1100;

/** Hard wall-clock ceiling on the whole scan, regardless of how many
 *  samples that leaves unqueried — a driver opening the "add stops"
 *  sheet needs a bounded wait, not a wait that scales with how badly
 *  Overpass's public mirrors happen to be rate-limiting this exact
 *  moment (live-verified: a fully degraded run can otherwise take over a
 *  minute). Whatever's already in the pool when this is hit is real data
 *  from real successful queries — returning it early is an honest partial
 *  result, not a fabricated one. */
const OVERPASS_SCAN_BUDGET_MS = 12_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashPolyline(polyline: string): string {
  // Mirrors stop-candidates.service.ts's own hashPolyline (not exported —
  // this cache key only needs to be stable, not cryptographically tied to
  // that one).
  let hash = 0;
  for (let i = 0; i < polyline.length; i++) {
    hash = (hash * 31 + polyline.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}

/**
 * Runs the sample -> nearby-place-search -> population-rank -> dedupe
 * pipeline for a route, independent of any specific ride (cached by a
 * hash of the polyline, same reuse-across-rides-on-the-same-route
 * reasoning as stop-candidates.service.ts's computeCandidatesForRoute).
 *
 * Each sample's search collects EVERY real place Overpass returns (not
 * just the nearest one) into one pool spanning the whole route, keeping
 * each distinct place's single best (highest-population) occurrence.
 * The pool is then filtered to a real, driver-plausible detour distance
 * (VIA_STOP_DETOUR_BUDGET — the same budget addCustomStop enforces when
 * the driver actually taps to add one, so nothing recommended here can
 * ever hit that endpoint's "too far" rejection), ranked by population,
 * capped, and finally re-sorted into real route order for display.
 *
 * Each sample is a real, sequential Overpass call (never parallelized —
 * a shared, free public API deserves the same considerate-load
 * discipline computeCandidatesForRoute's nearestRoad loop already
 * follows); a failed or empty-result sample is simply skipped, never
 * fabricated.
 */
export async function computeCityDetourCandidates(
  routePolyline: string,
): Promise<CityDetourCandidate[]> {
  const points: LatLng[] = decodePolyline(routePolyline);
  if (points.length < 2) return [];

  const routeLengthM = polylineDistanceMeters(points);
  const profile = classifyTripProfile(routeLengthM);
  const intervalM = cityStopSampleIntervalM(routeLengthM, profile.type);
  const searchRadiusM = CITY_SEARCH_RADIUS_M[profile.type];
  const detourBudgetM = VIA_STOP_DETOUR_BUDGET[profile.type].maxMeters;
  const hash = hashPolyline(routePolyline);
  const cacheKey = `route-stops:city-candidates:v3:${profile.type}:${hash}`;

  const redis = getRedis();
  if (redis) {
    const hit = await redis.get(cacheKey);
    if (hit) return JSON.parse(hit) as CityDetourCandidate[];
  }

  const samples = sampleRoutePoints(points, [], intervalM);
  const scanStartedAt = Date.now();

  // Keyed by lowercased name — keeps only each distinct place's
  // best (highest-population) sighting across every sample that
  // found it, rather than one entry per sample.
  const pool = new Map<string, OverpassPlace>();
  for (let i = 0; i < samples.length; i++) {
    if (Date.now() - scanStartedAt > OVERPASS_SCAN_BUDGET_MS) break;
    if (i > 0) await sleep(OVERPASS_SAMPLE_DELAY_MS);
    const nearby = await queryNearbyPlaces(samples[i]!.point, searchRadiusM);
    for (const place of nearby) {
      const key = place.name.toLowerCase();
      const existing = pool.get(key);
      if (!existing || (place.population ?? 0) > (existing.population ?? 0)) {
        pool.set(key, place);
      }
    }
  }

  const withinBudget = Array.from(pool.values()).filter(
    (place) => projectPointOntoRoute({ lat: place.lat, lng: place.lng }, points).distanceM <= detourBudgetM,
  );

  const rankedByPopulation = withinBudget
    .map((place) => ({
      candidate: { label: place.name, lat: place.lat, lng: place.lng },
      score: populationScore(place.population),
    }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.candidate);

  const kept = dedupeCities(rankedByPopulation, CITY_MERGE_RADIUS_M).slice(0, MAX_CITY_CANDIDATES);

  // Population ranking decided WHICH cities make the cut; the final
  // list reads in real route order, matching how a driver would
  // actually encounter them along the trip.
  const result = kept
    .map((c) => ({ candidate: c, fraction: projectPointOntoRoute({ lat: c.lat, lng: c.lng }, points).fraction }))
    .sort((a, b) => a.fraction - b.fraction)
    .map((s) => s.candidate);

  // Deliberately NOT using lib/cache.ts's generic `cached()` wrapper,
  // which would cache an empty result unconditionally — live-verified
  // this was a real bug during this feature's own development: a scan
  // degraded by transient Overpass rate-limiting produces an honest but
  // empty result, and caching that for a full hour would keep the
  // feature looking broken for that ride long after Overpass recovered.
  // An empty result is either a genuine "no real cities near this route"
  // (rare, cheap to recompute) or transient infra trouble (should retry
  // next call) — either way, only a non-empty result is worth caching.
  if (redis && result.length > 0) {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CITY_CANDIDATE_CACHE_TTL_SEC);
  }

  return result;
}

export interface CityDetourCandidatesResult {
  cities: CityDetourCandidate[];
  tripProfileType: TripProfileType | null;
}

/** Ride-scoped entry point (mirrors stop-candidates.service.ts's
 *  generateCandidateStopsForRide's auth/route-existence shape) — read-
 *  only, nothing persisted here. A city the driver actually taps to add
 *  flows through the existing addCustomStop('via') path, which performs
 *  its own real detour-distance validation and road-snapping independent
 *  of whatever this discovery pass suggested. */
export async function listCityDetourCandidates(
  db: Database,
  rideId: string,
  userId: string,
): Promise<CityDetourCandidatesResult> {
  const ride = await getDriverOwnedRideOrThrow(db, rideId, userId);
  if (!ride.routePolyline) return { cities: [], tripProfileType: null };

  const tripProfileType = classifyTripProfile(polylineDistanceMeters(decodePolyline(ride.routePolyline))).type;
  const cities = await computeCityDetourCandidates(ride.routePolyline);
  return { cities, tripProfileType };
}
