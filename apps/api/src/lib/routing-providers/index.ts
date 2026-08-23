import { getEnv } from '../../config/env.js';
import { GoogleRoutesProvider } from './google-routes.provider.js';
import { OsrmRoutingProvider } from './osrm.provider.js';
import type { RoutingProvider } from './routing-provider.types.js';

export type { RoutingProvider, RoutePoint, RouteResult } from './routing-provider.types.js';

let _provider: RoutingProvider | null = null;

/** Mirrors modules/geocoding/providers/index.ts's getLocationProvider
 *  selection exactly: ROUTING_PROVIDER='auto' (default) picks Google
 *  whenever a server key is configured, OSRM otherwise — so this codebase
 *  behaves identically to before this change in any environment without
 *  GOOGLE_MAPS_SERVER_API_KEY set (this sandbox included). */
export function getRoutingProvider(): RoutingProvider {
  if (_provider) return _provider;

  const env = getEnv();
  const googleKey = env.GOOGLE_ROUTES_API_KEY ?? env.GOOGLE_MAPS_SERVER_API_KEY;

  if (env.ROUTING_PROVIDER === 'osrm') {
    _provider = new OsrmRoutingProvider();
  } else if (env.ROUTING_PROVIDER === 'google') {
    if (!googleKey) {
      throw new Error('ROUTING_PROVIDER=google but no GOOGLE_MAPS_SERVER_API_KEY/GOOGLE_ROUTES_API_KEY is set');
    }
    _provider = new GoogleRoutesProvider(googleKey);
  } else {
    _provider = googleKey ? new GoogleRoutesProvider(googleKey) : new OsrmRoutingProvider();
  }
  return _provider;
}

export function resetRoutingProviderForTests(): void {
  _provider = null;
}
