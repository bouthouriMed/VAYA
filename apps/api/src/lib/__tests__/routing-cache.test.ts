import { describe, it, expect, vi, beforeEach } from 'vitest';

// No Redis: exercises the in-process tier on its own.
vi.mock('../redis.js', () => ({ getRedis: () => null }));
vi.mock('../../config/logger.js', () => ({ getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

const computeRoute = vi.fn();
vi.mock('../routing-providers/index.js', () => ({
  getRoutingProvider: () => ({ computeRoute, computeRouteAlternatives: vi.fn().mockResolvedValue(null) }),
}));

const A = { lat: 36.826, lng: 10.14 };
const B = { lat: 36.878, lng: 10.324 };
const realRoute = { polyline: 'abc', distanceM: 20_000, durationSec: 1500, isEstimate: false };

describe('getRoute caching', () => {
  beforeEach(async () => {
    computeRoute.mockReset();
    (await import('../routing.js')).clearRouteMemoryCache();
  });

  it('serves a repeated route from memory: one provider call (Google Routes is billed per call)', async () => {
    computeRoute.mockResolvedValue(realRoute);
    const { getRoute } = await import('../routing.js');
    await getRoute(A, B);
    await getRoute(A, B);
    expect(computeRoute).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent requests for the same route into one provider call', async () => {
    computeRoute.mockResolvedValue(realRoute);
    const { getRoute } = await import('../routing.js');
    const results = await Promise.all([getRoute(A, B), getRoute(A, B), getRoute(A, B)]);
    expect(results.every((r) => r.polyline === 'abc')).toBe(true);
    expect(computeRoute).toHaveBeenCalledTimes(1);
  });

  it('does not keep serving a straight-line fallback once routing recovers', async () => {
    vi.useFakeTimers();
    try {
      computeRoute.mockResolvedValueOnce(null).mockResolvedValue(realRoute);
      const { getRoute } = await import('../routing.js');
      expect((await getRoute(A, B)).isEstimate).toBe(true);
      vi.advanceTimersByTime(61_000);
      expect((await getRoute(A, B)).isEstimate).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps different waypoints as different routes', async () => {
    computeRoute.mockResolvedValue(realRoute);
    const { getRoute } = await import('../routing.js');
    await getRoute(A, B);
    await getRoute(A, B, [{ lat: 36.85, lng: 10.27 }]);
    expect(computeRoute).toHaveBeenCalledTimes(2);
  });
});
