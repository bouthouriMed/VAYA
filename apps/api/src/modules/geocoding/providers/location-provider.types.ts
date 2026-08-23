import type { LocationPoint, LocationPrediction, LocationType } from '@vaya/validation';

/**
 * LocationProvider abstraction (CLAUDE.md-aligned provider-boundary
 * pattern, mirrored from how lib/routing.ts already isolates OSRM): every
 * caller in this codebase talks to this interface, never to Google Places
 * or Nominatim response shapes directly. Swapping/adding a provider means
 * writing one new class here, not touching matching.service.ts,
 * geocoding.routes.ts, or any mobile screen.
 */
export interface LocationProvider {
  readonly name: 'google' | 'nominatim';

  /** Text predictions for an in-progress search. Returns [] (never throws)
   *  on a provider error or empty result — callers show an honest "no
   *  results" state, not a crash. */
  autocomplete(input: string, sessionToken: string): Promise<LocationPrediction[]>;

  /** Resolves one prediction (by its provider-issued placeId) into a full
   *  LocationPoint with real coordinates. Only ever called once per
   *  session, after the user actually selects a prediction (never per
   *  keystroke, never speculatively for every prediction shown) — the cost-
   *  control rule this whole abstraction exists partly to make easy to
   *  enforce, since there's exactly one call site in geocoding.service.ts
   *  that's allowed to invoke this. */
  resolveLocation(placeId: string, sessionToken: string): Promise<LocationPoint | null>;

  /** Label for a raw coordinate pair — used by stop-candidates.service.ts
   *  to name a driver's route_stop, and by the mobile "confirm your pickup
   *  pin" flows. No session-token concept (Google's Geocoding API isn't
   *  part of the Autocomplete+Details session-billing model at all). */
  reverseGeocode(lat: number, lng: number): Promise<LocationPoint | null>;
}

/** Shared, provider-agnostic type-classification helpers so both
 *  Google/Nominatim adapters produce the same LocationType taxonomy from
 *  their very different raw fields, rather than each inventing its own
 *  mapping ad hoc. */
export function unknownLocationType(): LocationType {
  return 'unknown';
}
