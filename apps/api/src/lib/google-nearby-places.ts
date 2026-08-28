import { getEnv } from '../config/env.js';
import { getLogger } from '../config/logger.js';

const PLACES_BASE_URL = 'https://places.googleapis.com/v1';
const FETCH_TIMEOUT_MS = 4000;

export interface GoogleNearbyPlace {
  name: string;
  lat: number;
  lng: number;
}

interface NearbySearchResponse {
  places?: Array<{
    displayName?: { text: string };
    location?: { latitude: number; longitude: number };
  }>;
}

/**
 * Real named localities within `radiusM` of a point, via Google Places
 * API (New) Nearby Search — the fast, reliable fallback tier for
 * city-detour-candidates.service.ts when Overpass (the primary,
 * population-ranked source — see lib/overpass.ts's own doc comment for
 * why it's primary) is slow or rate-limited. Deliberately NOT the
 * primary source itself: live-verified that Google's Nearby Search has
 * no population/significance field and, in a dense metro area, fills its
 * result cap with small suburbs before ever reaching a real major city
 * a few km further out. Still a real, meaningfully faster and more
 * available data source than a free public Overpass instance, which is
 * exactly what makes it the right fallback rather than a second primary.
 *
 * Returns [] (never throws, and returns immediately with no network call
 * at all when no Google key is configured) — an honest empty result,
 * same discipline as every other geocoding call in this codebase.
 */
export async function queryGoogleNearbyLocalities(
  point: { lat: number; lng: number },
  radiusM: number,
): Promise<GoogleNearbyPlace[]> {
  const env = getEnv();
  const apiKey = env.GOOGLE_PLACES_API_KEY ?? env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${PLACES_BASE_URL}/places:searchNearby`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.location',
      },
      body: JSON.stringify({
        includedTypes: ['locality'],
        // Google's actual maximum for Nearby Search — live-verified that
        // 10 wasn't enough in a moderately dense area to reach a real,
        // genuinely major city (e.g. Zaragoza) before the cap filled with
        // smaller surrounding towns; this tier already has no population
        // field to rank by, so casting the widest net Google allows is
        // the only lever available to still catch it.
        maxResultCount: 20,
        locationRestriction: {
          circle: { center: { latitude: point.lat, longitude: point.lng }, radius: radiusM },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Places Nearby Search responded ${response.status}`);
    const data = (await response.json()) as NearbySearchResponse;
    return (data.places ?? [])
      .filter((p) => p.location && p.displayName)
      .map((p) => ({ name: p.displayName!.text, lat: p.location!.latitude, lng: p.location!.longitude }));
  } catch (err) {
    getLogger().warn({ err, point, radiusM }, 'Google Places Nearby Search fallback request failed');
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
