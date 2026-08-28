import type { LocationPoint, LocationPrediction, LocationType } from '@vaya/validation';
import { getLogger } from '../../../config/logger.js';
import { getRedis } from '../../../lib/redis.js';
import type { LocationProvider } from './location-provider.types.js';

/**
 * OpenStreetMap Nominatim adapter — Vaya's original geocoding provider
 * (apps/api/src/modules/geocoding/geocoding.service.ts before this change),
 * refactored to satisfy the same LocationProvider interface the Google
 * adapter does, and kept as the automatic fallback when no
 * GOOGLE_MAPS_SERVER_API_KEY is configured (providers/index.ts) — per this
 * task's "do not remove existing functionality" instruction and CLAUDE.md's
 * standing rule against replacing working infrastructure without a
 * documented reason (the reason here — moving to Google Maps Platform — is
 * real and explicit, but "replace" means "make Google primary", not "delete
 * the thing that still works when Google isn't configured").
 */

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'VAYA-dev/0.1 (contact: dev@vaya.local)';
const FETCH_TIMEOUT_MS = 4000;
const TUNISIA_VIEWBOX = '7.5,37.6,11.6,30.2';
// Nominatim has no session-token/two-call concept at all — a "session"
// here is purely a short-lived server-side cache so resolveLocation doesn't
// need a second network call for a result autocomplete() already fetched.
// 10 minutes comfortably covers "user picked a result shortly after typing".
const SESSION_CACHE_TTL_SEC = 600;

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  class?: string;
  type?: string;
  osm_type?: string;
  osm_id?: number;
  address?: Record<string, string>;
}

/** Maps Nominatim's `class`/`type` fields (Location Architecture Spec
 *  §5[C]) onto Vaya's LocationType taxonomy. Deliberately conservative —
 *  falls through to 'unknown' rather than guessing when the tag
 *  combination isn't one of the well-documented common cases, per the
 *  spec's "classify, don't guess" principle. */
export function mapNominatimTypeToLocationType(
  osmClass: string | undefined,
  osmType: string | undefined,
  address: Record<string, string> | undefined,
): LocationType {
  if (osmClass === 'place') {
    if (osmType === 'country') return 'country';
    if (osmType === 'city' || osmType === 'town' || osmType === 'village') return 'city';
    if (osmType === 'suburb' || osmType === 'neighbourhood' || osmType === 'quarter') {
      return 'neighborhood';
    }
  }
  if (osmClass === 'boundary' && osmType === 'administrative') {
    // A governorate-level result has address.state populated but no finer
    // (city-level) component naming itself — a real city hit also carries
    // address.state (its containing governorate) but additionally has
    // address.city/town/village pointing at the settlement itself.
    const hasSettlementComponent =
      address && (address.city || address.town || address.village || address.suburb);
    if (address?.state && !hasSettlementComponent) return 'governorate';
    return 'city';
  }
  if (
    osmClass === 'railway' ||
    osmClass === 'aeroway' ||
    osmClass === 'amenity' ||
    osmClass === 'tourism' ||
    osmClass === 'shop'
  ) {
    return 'poi';
  }
  if (osmClass === 'highway' || osmClass === 'building') return 'address';
  return 'unknown';
}

function splitLabel(displayName: string): { primary: string; secondary: string | null } {
  const [first, ...rest] = displayName.split(',').map((s) => s.trim());
  const secondary = rest.join(', ');
  return { primary: first || displayName, secondary: secondary || null };
}

function toLocationPoint(result: NominatimResult): LocationPoint {
  const { primary, secondary } = splitLabel(result.display_name);
  return {
    placeId:
      result.osm_type && result.osm_id !== undefined
        ? `nominatim:${result.osm_type}:${result.osm_id}`
        : null,
    label: result.display_name,
    primaryText: primary,
    secondaryText: secondary,
    latitude: Number.parseFloat(result.lat),
    longitude: Number.parseFloat(result.lon),
    type: mapNominatimTypeToLocationType(result.class, result.type, result.address),
    formattedAddress: result.display_name,
    city: result.address?.city ?? result.address?.town ?? result.address?.village ?? null,
    governorate: result.address?.state ?? null,
    countryCode: result.address?.country_code?.toUpperCase() ?? null,
    source: 'nominatim',
  };
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export class NominatimProvider implements LocationProvider {
  readonly name = 'nominatim' as const;

  constructor(private readonly restrictToTunisia: boolean = true) {}

  async autocomplete(input: string, sessionToken: string): Promise<LocationPrediction[]> {
    try {
      const url = new URL(`${NOMINATIM_BASE_URL}/search`);
      url.searchParams.set('q', input);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '5');
      if (this.restrictToTunisia) {
        url.searchParams.set('viewbox', TUNISIA_VIEWBOX);
        url.searchParams.set('bounded', '1');
      }
      url.searchParams.set('addressdetails', '1');

      const response = await fetchWithTimeout(url.toString());
      if (!response.ok) throw new Error(`Nominatim search failed: ${response.status}`);
      const results = (await response.json()) as NominatimResult[];

      const points = results.map(toLocationPoint);

      // Stash full results so resolveLocation (called after the user picks
      // one) needs no second Nominatim call — a session-scoped cache, not a
      // permanent copy of Nominatim's data (expires in 10 minutes).
      const redis = getRedis();
      if (redis) {
        await Promise.all(
          points
            .filter((p) => p.placeId)
            .map((p) =>
              redis.set(
                `geo-session:${sessionToken}:${p.placeId}`,
                JSON.stringify(p),
                'EX',
                SESSION_CACHE_TTL_SEC,
              ),
            ),
        );
      }

      return points.map((p) => ({
        placeId: p.placeId ?? `nominatim:${p.latitude}:${p.longitude}`,
        primaryText: p.primaryText,
        secondaryText: p.secondaryText,
        type: p.type,
      }));
    } catch (err) {
      getLogger().warn({ err, provider: 'nominatim' }, 'Nominatim search failed');
      return [];
    }
  }

  async resolveLocation(placeId: string, sessionToken: string): Promise<LocationPoint | null> {
    const redis = getRedis();
    if (!redis) return null;
    const cached = await redis.get(`geo-session:${sessionToken}:${placeId}`);
    if (!cached) {
      getLogger().warn(
        { provider: 'nominatim', placeId },
        'resolveLocation cache miss — session expired or placeId from a different session',
      );
      return null;
    }
    return JSON.parse(cached) as LocationPoint;
  }

  async reverseGeocode(lat: number, lng: number): Promise<LocationPoint | null> {
    try {
      const roundedLat = lat.toFixed(4);
      const roundedLng = lng.toFixed(4);
      const url = new URL(`${NOMINATIM_BASE_URL}/reverse`);
      url.searchParams.set('lat', roundedLat);
      url.searchParams.set('lon', roundedLng);
      url.searchParams.set('format', 'json');
      url.searchParams.set('addressdetails', '1');

      const response = await fetchWithTimeout(url.toString());
      if (!response.ok) throw new Error(`Nominatim reverse geocode failed: ${response.status}`);
      const result = (await response.json()) as NominatimResult;
      return { ...toLocationPoint(result), latitude: lat, longitude: lng };
    } catch (err) {
      getLogger().warn({ err, provider: 'nominatim', lat, lng }, 'Nominatim reverse geocode failed');
      return null;
    }
  }
}
