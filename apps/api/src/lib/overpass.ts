import { getLogger } from '../config/logger.js';

// Multiple independent public mirrors of the same Overpass dataset —
// live-verified while building this that the main instance rate-limits
// hard under this feature's real call pattern (repeated 429s scanning a
// single ~150km route's dozen samples, even with >1s pacing between
// requests). Rotating across mirrors per call spreads load so one
// instance's limit doesn't stall an entire route scan; a mirror that
// fails (429, timeout, network error) is simply skipped in favor of the
// next one for that same query, not retried against itself.
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];
let mirrorRotation = 0;

const USER_AGENT = 'VAYA-dev/0.1 (contact: dev@vaya.local)';
// Per-mirror-attempt timeout — short enough that a slow/down mirror
// doesn't eat most of the scan's overall wall-clock budget
// (city-detour-candidates.service.ts's own OVERPASS_SCAN_BUDGET_MS) by
// itself before the next mirror even gets a chance.
const OVERPASS_TIMEOUT_MS = 4000;

export interface OverpassPlace {
  name: string;
  lat: number;
  lng: number;
  placeType: 'city' | 'town' | 'village';
  /** Real OSM `population` tag, when tagged — null when the node has no
   *  population data (common for small villages), never guessed. The one
   *  signal that actually distinguishes a real major city from a nearby
   *  small town, which nothing in Google Places' Nearby Search response
   *  reliably provides (see city-detour-candidates.service.ts's doc
   *  comment for the live-verified reasoning). */
  population: number | null;
}

async function queryOneMirror(
  url: string,
  query: string,
): Promise<{ elements?: Array<{ lat?: number; lon?: number; tags?: Record<string, string> }> } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Overpass mirror ${url} responded ${response.status}`);
    return (await response.json()) as {
      elements?: Array<{ lat?: number; lon?: number; tags?: Record<string, string> }>;
    };
  } catch (err) {
    getLogger().warn({ err, url }, 'Overpass mirror request failed, trying next mirror');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Real named settlements (city/town/village) within `radiusM` of a point,
 * via the free/keyless Overpass API (OpenStreetMap's raw query engine).
 * Used by city-detour-candidates.service.ts, which needs each result's
 * real population to rank genuinely significant cities above nearby small
 * towns — verified live that this is a real, meaningful signal Overpass
 * provides directly (Barcelona: population 1,713,247 vs. a neighboring
 * village at a few hundred), unlike Google Places' Nearby Search, whose
 * response carries no population field and — verified live — reliably
 * fails to surface a major city at all once denser small-town results
 * fill its result cap.
 *
 * Rotates across OVERPASS_MIRRORS, trying each in turn until one
 * succeeds — returns [] (never throws) only once every mirror has failed
 * for this query, same discipline as every other geocoding call in this
 * codebase: an empty result degrades to "no candidates from this
 * sample," not a crash.
 */
export async function queryNearbyPlaces(
  point: { lat: number; lng: number },
  radiusM: number,
  maxResults = 30,
): Promise<OverpassPlace[]> {
  // Two separately-capped statement blocks, not one combined query — a
  // real bug found live: `out body N` truncates to Overpass's own element
  // order (roughly OSM node id), which has nothing to do with size or
  // distance. A radius with dozens of small villages (common in rural
  // Aragón/Teruel — exactly where this was caught) can fill the whole cap
  // with villages alone and silently drop a real, meaningfully-sized town
  // or city in range even though it's genuinely within `radiusM`. City/town
  // (Spain's OSM convention tags most real mid-size towns — e.g. a ~16k
  // population municipality — as "town", not "city", so both need to be in
  // the protected block, not just "city") get a generous 40-cap of their
  // own that a realistic 25km radius essentially never hits; "village" (the
  // truly numerous, lowest-priority tier — populationScore already ranks
  // these last) keeps the original, tighter cap. Both blocks run in the
  // same request/response — still one HTTP round-trip.
  const timeoutSec = Math.floor(OVERPASS_TIMEOUT_MS / 1000);
  const query = `[out:json][timeout:${timeoutSec}];node["place"~"^(city|town)$"](around:${radiusM},${point.lat},${point.lng});out body 40;node["place"="village"](around:${radiusM},${point.lat},${point.lng});out body ${maxResults};`;

  let data: { elements?: Array<{ lat?: number; lon?: number; tags?: Record<string, string> }> } | null = null;
  for (let i = 0; i < OVERPASS_MIRRORS.length; i++) {
    const mirror = OVERPASS_MIRRORS[(mirrorRotation + i) % OVERPASS_MIRRORS.length]!;
    data = await queryOneMirror(mirror, query);
    if (data) break;
  }
  // Start the NEXT call from a different mirror than this one, spreading
  // load across all of them over the course of a route scan rather than
  // always hammering the same primary first.
  mirrorRotation = (mirrorRotation + 1) % OVERPASS_MIRRORS.length;
  if (!data) return [];

  return (data.elements ?? [])
    .filter(
      (el): el is { lat: number; lon: number; tags?: Record<string, string> } =>
        typeof el.lat === 'number' && typeof el.lon === 'number',
    )
    .map((el): OverpassPlace | null => {
      // Prefer a Latin-script name (this app's primary UI language is
      // French) over OSM's bare `name` tag, which can be in the local
      // script — falls back to it only when no French/English variant
      // exists.
      const name = el.tags?.['name:fr'] ?? el.tags?.['name:en'] ?? el.tags?.name ?? null;
      const placeTag = el.tags?.place;
      if (!name || (placeTag !== 'city' && placeTag !== 'town' && placeTag !== 'village')) return null;
      const populationRaw = el.tags?.population;
      const population = populationRaw ? Number.parseInt(populationRaw, 10) : null;
      return {
        name,
        lat: el.lat,
        lng: el.lon,
        placeType: placeTag,
        population: population !== null && Number.isFinite(population) ? population : null,
      };
    })
    .filter((p): p is OverpassPlace => p !== null);
}
