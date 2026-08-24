import { getEnv } from '../../../config/env.js';
import { GooglePlacesProvider } from './google-places.provider.js';
import { NominatimProvider } from './nominatim.provider.js';
import type { LocationProvider } from './location-provider.types.js';

export type { LocationProvider } from './location-provider.types.js';

let _provider: LocationProvider | null = null;

/**
 * Selects the active LocationProvider once, lazily, per process — mirrors
 * lib/database.ts's singleton pattern. LOCATION_PROVIDER='auto' (the
 * default) picks Google whenever a server key is configured, and falls back
 * to the existing Nominatim path otherwise — so this codebase behaves
 * identically to before this change in any environment that hasn't set
 * GOOGLE_MAPS_SERVER_API_KEY yet (this sandbox included), and switches to
 * Google the moment a real key is added, with zero code change required.
 */
export function getLocationProvider(): LocationProvider {
  if (_provider) return _provider;

  const env = getEnv();
  const googleKey = env.GOOGLE_PLACES_API_KEY ?? env.GOOGLE_MAPS_SERVER_API_KEY;
  const restrictToTunisia = env.LOCATION_RESTRICT_TO_TUNISIA;

  if (env.LOCATION_PROVIDER === 'nominatim') {
    _provider = new NominatimProvider(restrictToTunisia);
  } else if (env.LOCATION_PROVIDER === 'google') {
    if (!googleKey) {
      throw new Error('LOCATION_PROVIDER=google but no GOOGLE_MAPS_SERVER_API_KEY/GOOGLE_PLACES_API_KEY is set');
    }
    _provider = new GooglePlacesProvider(googleKey, restrictToTunisia);
  } else {
    _provider = googleKey
      ? new GooglePlacesProvider(googleKey, restrictToTunisia)
      : new NominatimProvider(restrictToTunisia);
  }
  return _provider;
}

/** Test-only reset — mirrors the pattern other lazily-singleton lib modules
 *  in this codebase would need for isolated unit tests. */
export function resetLocationProviderForTests(): void {
  _provider = null;
}
