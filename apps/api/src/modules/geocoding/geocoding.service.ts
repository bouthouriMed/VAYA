import type { GeocodeResult, LocationPoint, LocationPrediction } from '@vaya/validation';
import { getLocationProvider } from './providers/index.js';

/**
 * Thin delegation layer over the active LocationProvider (providers/index.ts
 * — Google Places (New) when configured, Nominatim otherwise). Every call
 * site in this codebase goes through these functions, never through a
 * provider class directly — this file is the one place that would need to
 * change if a third provider were ever added.
 */

/** New autocomplete flow (Places API (New)'s session-token model) —
 *  predictions only, no coordinates yet. See resolveLocation. */
export async function autocompleteLocation(
  input: string,
  sessionToken: string,
): Promise<LocationPrediction[]> {
  return getLocationProvider().autocomplete(input, sessionToken);
}

/** Resolves a prediction's placeId into a full LocationPoint — call this
 *  exactly once, only after the user selects a prediction (never per
 *  keystroke, never for every prediction shown), reusing the exact
 *  sessionToken the autocomplete call(s) used. */
export async function resolveLocation(
  placeId: string,
  sessionToken: string,
): Promise<LocationPoint | null> {
  return getLocationProvider().resolveLocation(placeId, sessionToken);
}

/** Reverse geocoding for an exact coordinate — used to label a driver's
 *  route_stop candidate (stop-candidates.service.ts) and the mobile "confirm
 *  pickup pin" flows. Throws (matching this function's pre-existing
 *  contract) rather than returning null, since every existing call site
 *  already wraps this in its own try/catch with a graceful fallback label. */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
  const result = await getLocationProvider().reverseGeocode(lat, lng);
  if (!result) throw new Error(`Reverse geocode failed for ${lat},${lng}`);
  return { label: result.label, lat: result.latitude, lng: result.longitude };
}

/** Real named cities/towns within `radiusM` of a point — used by
 *  city-detour-candidates.service.ts to build a driver's "cities you can
 *  offer as a detour" list along their route. Genuinely different from
 *  reverseGeocode (which only resolves what CONTAINS the exact point, so
 *  it finds nothing for a point on a highway or in open countryside
 *  between towns — most of a route's actual sampled geometry). */
export async function searchNearbyLocalities(
  point: { lat: number; lng: number },
  radiusM: number,
): Promise<LocationPoint[]> {
  return getLocationProvider().searchNearbyLocalities(point, radiusM);
}
