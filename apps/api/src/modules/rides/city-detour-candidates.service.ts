import { classifyTripProfile, type TripProfileType } from '@vaya/domain';
import { decodePolyline, type LatLng } from '../../lib/polyline.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
import { cached } from '../../lib/cache.js';
import { getLogger } from '../../config/logger.js';
import { searchNearbyLocalities } from '../geocoding/geocoding.service.js';
import {
  sampleRoutePoints,
  polylineDistanceMeters,
  getDriverOwnedRideOrThrow,
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

/** Hard cap on how many reverse-geocode calls one route scan makes,
 *  regardless of route length — a very long intercity route (e.g.
 *  700km+) would otherwise generate dozens of samples, each a real
 *  network call to the geocoding provider (Nominatim's usage policy caps
 *  at ~1 req/s). Widens the effective sample interval instead of
 *  uncapping the call count. */
const MAX_CITY_SAMPLES = 24;

/** Cities found within this distance of an already-kept one are treated
 *  as the same real place (a route can sample the same city's outskirts
 *  from two different angles/passes) — merge to the first (route-order)
 *  occurrence rather than listing near-duplicates. */
export const CITY_MERGE_RADIUS_M = 5000;

/** How far from each route sample to search for a real nearby city —
 *  wide enough to bridge the gap between consecutive samples (so a real
 *  town roughly midway between two samples is still found by at least
 *  one of them) without searching so wide that a sample picks up a city
 *  genuinely closer to a neighboring sample instead. Scaled directly off
 *  the sample interval itself rather than a fixed constant, since that
 *  interval is already profile/route-length-aware. */
const CITY_SEARCH_RADIUS_FACTOR = 0.75;

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
 * Runs the sample -> nearby-city-search -> pick-nearest -> dedupe pipeline
 * for a route, independent of any specific ride (cached by a hash of the
 * polyline, same reuse-across-rides-on-the-same-route reasoning as
 * stop-candidates.service.ts's computeCandidatesForRoute).
 *
 * Deliberately a real nearby-PLACE search (searchNearbyLocalities), not a
 * reverse-geocode of the exact sample point — reverse geocoding only
 * resolves what CONTAINS a point, which for a route sample (almost always
 * a spot on a road, not inside a settlement's own polygon) returns
 * nothing for most of a real route's geometry. Verified live against
 * this repo's actual geocoding provider while building this.
 *
 * Each sample is a real, sequential search call (never parallelized —
 * the same shared-provider-rate-limit discipline computeCandidatesForRoute's
 * nearestRoad loop already follows); a failed or empty-result sample is
 * simply skipped, never fabricated.
 */
export async function computeCityDetourCandidates(
  routePolyline: string,
): Promise<CityDetourCandidate[]> {
  const points: LatLng[] = decodePolyline(routePolyline);
  if (points.length < 2) return [];

  const routeLengthM = polylineDistanceMeters(points);
  const profile = classifyTripProfile(routeLengthM);
  const intervalM = cityStopSampleIntervalM(routeLengthM, profile.type);
  const hash = hashPolyline(routePolyline);

  return cached(
    `route-stops:city-candidates:v2:${profile.type}:${hash}`,
    CITY_CANDIDATE_CACHE_TTL_SEC,
    async () => {
      const samples = sampleRoutePoints(points, [], intervalM);
      const searchRadiusM = intervalM * CITY_SEARCH_RADIUS_FACTOR;
      const raw: CityDetourCandidate[] = [];

      for (const sample of samples) {
        let nearby;
        try {
          nearby = await searchNearbyLocalities(sample.point, searchRadiusM);
        } catch (err) {
          getLogger().warn({ err }, 'Nearby-locality search failed while scanning for city detour candidates');
          continue;
        }
        if (nearby.length === 0) continue;
        const nearest = nearby.reduce((best, candidate) =>
          haversineDistanceMeters(sample.point, { lat: candidate.latitude, lng: candidate.longitude }) <
          haversineDistanceMeters(sample.point, { lat: best.latitude, lng: best.longitude })
            ? candidate
            : best,
        );
        raw.push({ label: nearest.primaryText, lat: nearest.latitude, lng: nearest.longitude });
      }

      return dedupeCities(raw, CITY_MERGE_RADIUS_M).slice(0, MAX_CITY_CANDIDATES);
    },
  );
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
