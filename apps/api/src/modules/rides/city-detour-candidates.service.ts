import { eq } from 'drizzle-orm';
import { classifyTripProfile, type TripProfileType } from '@vaya/domain';
import { decodePolyline, projectPointOntoRoute, type LatLng } from '../../lib/polyline.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
import { getRedis } from '../../lib/redis.js';
import { queryNearbyPlaces, type OverpassPlace } from '../../lib/overpass.js';
import { queryGoogleNearbyLocalities } from '../../lib/google-nearby-places.js';
import { routeStops } from '../../db/schema/index.js';
import {
  sampleRoutePoints,
  polylineDistanceMeters,
  getDriverOwnedRideOrThrow,
  VIA_STOP_DETOUR_BUDGET,
  type RouteSample,
} from './stop-candidates.service.js';
import type { getDatabase } from '../../lib/database.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * Real, named cities/towns along a ride's route that a driver can offer as
 * a detour stop — the primary, browsable list this feature is actually
 * about (per direct product feedback: "user should be able to see
 * predefined cities in his route, not manually search... think like
 * BlaBlaCar", and later: "recommend cities, if not cities recommend
 * small towns... without too long loading"). Manual search
 * (addCustomStop's existing 'via' role) stays the fallback for a real
 * place none of the tiers below surfaced.
 *
 * A real three-tier fallback chain, not a single source of truth:
 *
 * 1. Overpass (lib/overpass.ts), ranked by real OSM population — the
 *    best result when available (verified live: correctly ranks
 *    Barcelona, population 1,713,247, above the small towns around it —
 *    something Google's own Nearby Search response has no field to do
 *    at all). Bounded by a hard wall-clock race (OVERPASS_SCAN_BUDGET_MS)
 *    so a rate-limited or slow public mirror can't leave the driver
 *    waiting indefinitely — live-verified this free service genuinely
 *    can degrade under repeated use, and a fully degraded run must still
 *    resolve quickly, not eventually.
 * 2. Google Places Nearby Search (lib/google-nearby-places.ts), only when
 *    tier 1 comes back empty — fast and reliable, ranked by how many
 *    distinct route samples each place showed up in (a real, if cruder,
 *    significance proxy than population: a genuinely central place has
 *    a wider "pull" across several samples, a tiny village only shows up
 *    once), run in parallel across samples rather than tier 1's
 *    considerate sequential pacing (Google's own per-key rate limits are
 *    far more generous than a shared free Overpass mirror).
 * 3. This specific ride's own already-generated on-road micro-stops
 *    (stop-candidates.service.ts, computed at ride-creation time from
 *    OSRM/Google routing + reverse geocoding — a wholly independent
 *    pipeline from tiers 1/2, so it can't share their failure mode),
 *    only when BOTH of the above are empty. Not distinct "cities," but
 *    real, road-snapped, named points along this exact route — a
 *    driver willing to detour to *some* real place is better served by
 *    an honest "these are real points on your route" list than a
 *    literal empty state. Lives in listCityDetourCandidates below,
 *    since it needs this specific ride's DB row, not just its polyline.
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

/** Hard cap on how many samples one route scan makes, regardless of route
 *  length — a very long intercity route (e.g. 700km+) would otherwise
 *  generate dozens of samples, each a real network call. Widens the
 *  effective sample interval instead of uncapping the call count. */
const MAX_CITY_SAMPLES = 24;

/** How far from each route sample to search for real nearby places —
 *  deliberately generous and NOT tied to the sample interval (unlike the
 *  interval itself): a genuinely major city's real "pull" for a detour is
 *  legitimately wider than a small town's, and live testing showed a
 *  city needs to be well within this radius of at least one sample to be
 *  found at all (neither Overpass nor Google's Nearby Search has a
 *  ranked "search near, ordered by significance" mode — a place is
 *  either inside the query circle or it's invisible to that query). */
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

/** Hard wall-clock ceiling on the whole Overpass tier, enforced as a real
 *  race (not just a "check between samples" loop condition, which live
 *  testing showed can still let a single fully-failed sample — three
 *  mirrors each timing out — eat up to ~12s on its own before the check
 *  even runs again). Whatever's already in the pool when this fires is
 *  real data from real successful queries; racing it out early is an
 *  honest partial/empty result, never a fabricated one, and it's what
 *  lets tier 2 (Google) actually kick in within a UX-reasonable total
 *  wait instead of only after Overpass has been given every chance to
 *  eventually succeed. */
const OVERPASS_SCAN_BUDGET_MS = 5_000;

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

/** Filters a scored candidate pool to a real, driver-plausible detour
 *  distance (VIA_STOP_DETOUR_BUDGET — the same budget addCustomStop
 *  enforces when the driver actually taps to add one, so nothing
 *  recommended here can ever hit that endpoint's "too far" rejection),
 *  ranks by score, dedupes/caps, then re-sorts the kept set into real
 *  route order for display — shared by both the Overpass and Google
 *  tiers below, which differ only in how they score a candidate. */
function filterRankAndOrder(
  scored: Array<{ candidate: CityDetourCandidate; score: number }>,
  points: LatLng[],
  detourBudgetM: number,
): CityDetourCandidate[] {
  const withinBudget = scored.filter(
    (s) => projectPointOntoRoute({ lat: s.candidate.lat, lng: s.candidate.lng }, points).distanceM <= detourBudgetM,
  );
  const rankedByScore = withinBudget.sort((a, b) => b.score - a.score).map((s) => s.candidate);
  const kept = dedupeCities(rankedByScore, CITY_MERGE_RADIUS_M).slice(0, MAX_CITY_CANDIDATES);
  return kept
    .map((c) => ({ candidate: c, fraction: projectPointOntoRoute({ lat: c.lat, lng: c.lng }, points).fraction }))
    .sort((a, b) => a.fraction - b.fraction)
    .map((s) => s.candidate);
}

/** Tier 1: real, sequential, pace-limited Overpass queries — collects
 *  EVERY place a sample finds (not just the nearest) into one pool
 *  spanning the whole route, keeping each distinct place's single best
 *  (highest-population) occurrence. Races against OVERPASS_SCAN_BUDGET_MS
 *  so a badly-degraded run still returns (whatever partial pool exists)
 *  within a bounded time — the background scan isn't cancelled, it's
 *  just no longer waited on. */
async function scanOverpassCities(
  samples: RouteSample[],
  searchRadiusM: number,
  points: LatLng[],
  detourBudgetM: number,
): Promise<CityDetourCandidate[]> {
  const pool = new Map<string, OverpassPlace>();
  const scanPromise = (async () => {
    for (let i = 0; i < samples.length; i++) {
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
  })();
  await Promise.race([scanPromise, sleep(OVERPASS_SCAN_BUDGET_MS)]);

  const scored = Array.from(pool.values()).map((place) => ({
    candidate: { label: place.name, lat: place.lat, lng: place.lng },
    score: populationScore(place.population),
  }));
  return filterRankAndOrder(scored, points, detourBudgetM);
}

/** Tier 2: Google Places Nearby Search, queried in parallel across every
 *  sample (unlike tier 1's considerate sequential pacing — a real,
 *  per-key Google quota tolerates this fine, and this tier's whole job
 *  is to answer fast when Overpass didn't). Ranked by how many distinct
 *  samples found each place — no population field exists here, but a
 *  place with real "pull" across multiple samples is a meaningfully
 *  better significance proxy than raw proximity alone. */
async function scanGoogleFallbackCities(
  samples: RouteSample[],
  searchRadiusM: number,
  points: LatLng[],
  detourBudgetM: number,
): Promise<CityDetourCandidate[]> {
  const perSampleResults = await Promise.all(
    samples.map((sample) => queryGoogleNearbyLocalities(sample.point, searchRadiusM)),
  );

  const pool = new Map<string, { label: string; lat: number; lng: number; occurrences: number }>();
  for (const places of perSampleResults) {
    for (const place of places) {
      const key = place.name.toLowerCase();
      const existing = pool.get(key);
      if (existing) existing.occurrences += 1;
      else pool.set(key, { label: place.name, lat: place.lat, lng: place.lng, occurrences: 1 });
    }
  }

  const scored = Array.from(pool.values()).map((place) => ({
    candidate: { label: place.label, lat: place.lat, lng: place.lng },
    score: place.occurrences,
  }));

  return filterRankAndOrder(scored, points, detourBudgetM);
}

/**
 * Runs the tier-1/tier-2 discovery pipeline for a route, independent of
 * any specific ride (cached by a hash of the polyline, same
 * reuse-across-rides-on-the-same-route reasoning as
 * stop-candidates.service.ts's computeCandidatesForRoute). Tier 3 (this
 * ride's own on-road stops) lives in listCityDetourCandidates below,
 * since it needs a specific ride's DB row.
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
  const cacheKey = `route-stops:city-candidates:v4:${profile.type}:${hash}`;

  const redis = getRedis();
  if (redis) {
    const hit = await redis.get(cacheKey);
    if (hit) return JSON.parse(hit) as CityDetourCandidate[];
  }

  const samples = sampleRoutePoints(points, [], intervalM);

  let result = await scanOverpassCities(samples, searchRadiusM, points, detourBudgetM);
  if (result.length === 0) {
    result = await scanGoogleFallbackCities(samples, searchRadiusM, points, detourBudgetM);
  }

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
  let cities = await computeCityDetourCandidates(ride.routePolyline);

  // Tier 3: this ride's own already-generated on-road micro-stops
  // (stop-candidates.service.ts) — a wholly independent pipeline from
  // Overpass/Google above, computed at ride-creation time, so it can't
  // share either tier's failure mode. Not distinct "cities," but real,
  // road-snapped, named points along this exact route — shown only when
  // both tiers above genuinely found nothing, per direct product
  // feedback: "if not cities, recommend small towns" rather than an
  // honest-but-unhelpful empty list.
  if (cities.length === 0) {
    const onRoadStops = await db.query.routeStops.findMany({ where: eq(routeStops.rideId, rideId) });
    cities = onRoadStops.map((s) => ({ label: s.label, lat: s.lat, lng: s.lng }));
  }

  return { cities, tripProfileType };
}
