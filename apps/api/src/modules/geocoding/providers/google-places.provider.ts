import type { LocationPoint, LocationPrediction, LocationType } from '@vaya/validation';
import { getLogger } from '../../../config/logger.js';
import type { LocationProvider } from './location-provider.types.js';

/**
 * Google Places API (New) + Geocoding API adapter — the primary
 * LocationProvider once GOOGLE_MAPS_SERVER_API_KEY is configured (see
 * providers/index.ts for the auto/google/nominatim selection logic).
 *
 * Live-verified (2026-08-28, matching-engine-redesign worktree): this
 * environment's outbound network reaches places.googleapis.com and
 * maps.googleapis.com directly, and a real key was already present in
 * this worktree's own .env — reverseGeocode, Places Nearby Search, and
 * Autocomplete were each exercised against real responses for real
 * Tunisia coordinates while building searchNearbyLocalities below. An
 * earlier version of this comment claimed the opposite (blocked outbound,
 * no real key) — that was true of a different, earlier sandbox session,
 * not this one; don't assume it still applies without checking again in
 * whatever environment actually runs this.
 */

const PLACES_BASE_URL = 'https://places.googleapis.com/v1';
const GEOCODING_BASE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const FETCH_TIMEOUT_MS = 4000;
// Tunisia only, per this whole codebase's existing scope (Nominatim's
// TUNISIA_VIEWBOX in the fallback provider plays the identical role) —
// toggled by env.LOCATION_RESTRICT_TO_TUNISIA, see providers/index.ts.
const TUNISIA_REGION_CODE = 'tn';

// Only the fields this app actually renders/stores — Google bills Place
// Details by field-mask "SKU tier", so requesting fewer/cheaper fields is a
// real cost control, not just tidiness (brief §7/§23).
const PLACE_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'addressComponents',
  'types',
  'primaryType',
].join(',');

interface PlacesAutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId: string;
      text?: { text: string };
      structuredFormat?: {
        mainText?: { text: string };
        secondaryText?: { text: string };
      };
      types?: string[];
    };
  }>;
}

interface PlaceDetailsResponse {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
  types?: string[];
  primaryType?: string;
}

interface GeocodingApiResponse {
  status: string;
  results: Array<{
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
    address_components: Array<{ long_name: string; short_name: string; types: string[] }>;
    place_id: string;
    types: string[];
  }>;
}

/** Maps Google's `types[]` array (documented at
 *  developers.google.com/maps/documentation/places/web-service/place-types)
 *  onto Vaya's own LocationType taxonomy (packages/validation/geocoding.ts,
 *  Location Architecture Spec §4/§5[C]) — checked most-specific-first so a
 *  point that is technically inside a locality (nearly everything) still
 *  classifies by its own real type rather than always falling through to
 *  "city". Verified live against real Google Places API (New) responses for
 *  Tunisia queries (2026-08-23): `administrative_area_level_2` is Tunisia's
 *  delegation/معتمدية level (e.g. "Sousse Médina") — the location-architecture
 *  spec's own §4 calls for collapsing delegation into 'city' since this
 *  taxonomy has no separate 'delegation' value, so it's treated as 'city'
 *  here, not left unmapped. `neighborhood` is also a real, literal type
 *  Google returns (e.g. "Sousse Riadh") distinct from the `sublocality*`
 *  family this mapping originally checked for only. */
export function mapGoogleTypesToLocationType(types: string[] | undefined): LocationType {
  const set = new Set(types ?? []);
  if (set.has('country')) return 'country';
  if (set.has('administrative_area_level_1')) return 'governorate';
  if (set.has('street_address') || set.has('premise') || set.has('subpremise')) return 'address';
  if (
    set.has('route') ||
    Array.from(set).some((t) => t.startsWith('street_')) // e.g. street_number
  ) {
    return 'address';
  }
  if (set.has('establishment') || set.has('point_of_interest') || set.has('transit_station')) {
    return 'poi';
  }
  if (
    set.has('neighborhood') ||
    set.has('sublocality') ||
    Array.from(set).some((t) => t.startsWith('sublocality_'))
  ) {
    return 'neighborhood';
  }
  if (set.has('locality') || set.has('postal_town') || set.has('administrative_area_level_2')) {
    return 'city';
  }
  return 'unknown';
}

/** Google's reverse-geocode response is an array of alternate
 *  interpretations of the same coordinate (street_address, route, premise,
 *  plus_code, admin levels, ...), not ranked by human-readability — a
 *  `plus_code` entry (e.g. "V528+3RF, Ariana, Tunisia") can legitimately
 *  sort first for a rooftop point Google can't precisely match to a named
 *  street. Prefers the most specific real-address type, then progressively
 *  coarser but still human-readable admin levels, before ever falling back
 *  to a raw plus_code — a governorate/locality name is always more useful
 *  to a driver than a grid code, even when it's the least specific option
 *  available. plus_code is only ever chosen when it's literally the only
 *  result Google returned for that coordinate. */
export function pickBestGeocodeResult<T extends { types: string[] }>(
  results: T[],
): T | undefined {
  const nonPlusCode = results.filter((r) => !r.types.includes('plus_code'));
  return (
    results.find((r) => r.types.includes('street_address')) ??
    results.find((r) => r.types.includes('premise')) ??
    results.find((r) => r.types.includes('route')) ??
    results.find((r) => r.types.includes('sublocality')) ??
    results.find((r) => r.types.includes('neighborhood')) ??
    results.find((r) => r.types.includes('locality')) ??
    results.find((r) => r.types.includes('administrative_area_level_2')) ??
    results.find((r) => r.types.includes('administrative_area_level_1')) ??
    nonPlusCode[0] ??
    results[0]
  );
}

function findAddressComponent(
  components: Array<{ longText: string; types: string[] }> | undefined,
  type: string,
): string | null {
  return components?.find((c) => c.types.includes(type))?.longText ?? null;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export class GooglePlacesProvider implements LocationProvider {
  readonly name = 'google' as const;

  constructor(
    private readonly apiKey: string,
    private readonly restrictToTunisia: boolean = true,
  ) {}

  async autocomplete(input: string, sessionToken: string): Promise<LocationPrediction[]> {
    try {
      const response = await fetchWithTimeout(`${PLACES_BASE_URL}/places:autocomplete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          // Minimal field mask — Autocomplete predictions never need more
          // than the id/text fields this app actually shows in the list.
          'X-Goog-FieldMask':
            'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types',
        },
        body: JSON.stringify({
          input,
          sessionToken,
          ...(this.restrictToTunisia ? { includedRegionCodes: [TUNISIA_REGION_CODE] } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(`Places Autocomplete responded ${response.status}`);
      }
      const data = (await response.json()) as PlacesAutocompleteResponse;
      return (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({
          placeId: p.placeId,
          primaryText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
          secondaryText: p.structuredFormat?.secondaryText?.text ?? null,
          type: mapGoogleTypesToLocationType(p.types),
        }));
    } catch (err) {
      getLogger().warn({ err, provider: 'google' }, 'Places Autocomplete request failed');
      return [];
    }
  }

  async resolveLocation(placeId: string, sessionToken: string): Promise<LocationPoint | null> {
    try {
      const url = new URL(`${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`);
      url.searchParams.set('sessionToken', sessionToken);
      const response = await fetchWithTimeout(url.toString(), {
        headers: {
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
        },
      });
      if (!response.ok) {
        throw new Error(`Place Details responded ${response.status}`);
      }
      const data = (await response.json()) as PlaceDetailsResponse;
      if (!data.location) return null;

      const type = mapGoogleTypesToLocationType(data.types);
      return {
        placeId: data.id,
        label: data.formattedAddress ?? data.displayName?.text ?? '',
        primaryText: data.displayName?.text ?? data.formattedAddress ?? '',
        secondaryText: data.formattedAddress ?? null,
        latitude: data.location.latitude,
        longitude: data.location.longitude,
        type,
        formattedAddress: data.formattedAddress ?? null,
        city: findAddressComponent(data.addressComponents, 'locality'),
        governorate: findAddressComponent(data.addressComponents, 'administrative_area_level_1'),
        countryCode:
          data.addressComponents?.find((c) => c.types.includes('country'))?.shortText ?? null,
        source: 'google',
        // M-014: Google's Places/Geocoding responses carry no equivalent of
        // OSM's class/type tags — honestly absent, never guessed.
        osmClass: null,
        osmType: null,
      };
    } catch (err) {
      getLogger().warn({ err, provider: 'google', placeId }, 'Place Details request failed');
      return null;
    }
  }

  async reverseGeocode(lat: number, lng: number): Promise<LocationPoint | null> {
    try {
      const url = new URL(GEOCODING_BASE_URL);
      url.searchParams.set('latlng', `${lat},${lng}`);
      url.searchParams.set('key', this.apiKey);
      const response = await fetchWithTimeout(url.toString(), {});
      if (!response.ok) throw new Error(`Geocoding API responded ${response.status}`);
      const data = (await response.json()) as GeocodingApiResponse;
      const result = pickBestGeocodeResult(data.results);
      if (data.status !== 'OK' || !result) return null;

      const components = result.address_components.map((c) => ({
        longText: c.long_name,
        types: c.types,
      }));
      return {
        placeId: result.place_id,
        label: result.formatted_address,
        primaryText: result.formatted_address,
        secondaryText: null,
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        type: mapGoogleTypesToLocationType(result.types),
        formattedAddress: result.formatted_address,
        city: findAddressComponent(components, 'locality'),
        governorate: findAddressComponent(components, 'administrative_area_level_1'),
        countryCode:
          result.address_components.find((c) => c.types.includes('country'))?.short_name ?? null,
        source: 'google',
        osmClass: null,
        osmType: null,
      };
    } catch (err) {
      getLogger().warn({ err, provider: 'google', lat, lng }, 'Reverse geocode request failed');
      return null;
    }
  }
}
