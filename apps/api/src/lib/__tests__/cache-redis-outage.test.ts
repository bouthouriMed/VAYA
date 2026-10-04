import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Production incident (Sentry VAYA-API-6): the Upstash plan hit its request
 * limit, every Redis command failed with "ERR max requests limit exceeded",
 * and POST /rides returned 500 because the route cache awaited Redis
 * unguarded. Redis is a cache: its failure must only cost a cache miss.
 */
const upstashLimitError = Object.assign(new Error('ERR max requests limit exceeded. Limit: 500000, Usage: 500005.'), {
  name: 'ReplyError',
});
const failingRedis = {
  get: vi.fn().mockRejectedValue(upstashLimitError),
  set: vi.fn().mockRejectedValue(upstashLimitError),
  del: vi.fn().mockRejectedValue(upstashLimitError),
};

vi.mock('../redis.js', () => ({ getRedis: () => failingRedis }));
vi.mock('../../config/logger.js', () => ({ getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

const computeRoute = vi.fn();
vi.mock('../routing-providers/index.js', () => ({
  getRoutingProvider: () => ({ computeRoute, computeRouteAlternatives: vi.fn().mockResolvedValue(null) }),
}));

describe('best-effort cache when Redis is failing (Upstash quota exhausted)', () => {
  beforeEach(async () => {
    computeRoute.mockReset();
    (await import('../routing.js')).clearRouteMemoryCache();
  });

  it('cacheGet/cacheSet/cacheDel never throw — a failure is a miss / a skipped write', async () => {
    const { cacheGet, cacheGetJson, cacheSet, cacheDel } = await import('../cache.js');
    await expect(cacheGet('k')).resolves.toBeNull();
    await expect(cacheGetJson('k')).resolves.toBeNull();
    await expect(cacheSet('k', 'v', 60)).resolves.toBe(false);
    await expect(cacheDel('k')).resolves.toBeUndefined();
  });

  it('cached() still returns the freshly fetched value', async () => {
    const { cached } = await import('../cache.js');
    await expect(cached('k', 60, async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it('getRoute (used by POST /rides) still returns the real route', async () => {
    computeRoute.mockResolvedValue({ polyline: 'abc', distanceM: 1000, durationSec: 120, isEstimate: false });
    const { getRoute } = await import('../routing.js');
    const route = await getRoute({ lat: 36.82, lng: 10.17 }, { lat: 36.89, lng: 10.32 });
    expect(route).toEqual({ polyline: 'abc', distanceM: 1000, durationSec: 120, isEstimate: false });
  });

  it('getRoute falls back to the straight-line estimate when the provider is down too', async () => {
    computeRoute.mockResolvedValue(null);
    const { getRoute } = await import('../routing.js');
    const route = await getRoute({ lat: 36.82, lng: 10.17 }, { lat: 36.89, lng: 10.32 });
    expect(route.isEstimate).toBe(true);
    expect(route.distanceM).toBeGreaterThan(0);
  });

  it('redeeming a route-selection token degrades to "no token" so createRide uses the default route', async () => {
    const { redeemRouteToken } = await import('../../modules/rides/route-options.service.js');
    await expect(
      redeemRouteToken('00000000-0000-0000-0000-000000000000', { lat: 36.82, lng: 10.17 }, { lat: 36.89, lng: 10.32 }),
    ).resolves.toBeNull();
  });
});
