import { describe, it, expect } from 'vitest';
import { getRouteOptions, redeemRouteToken } from '../route-options.service.js';

/**
 * Exercises the real docker-composed Redis instance (token storage) and
 * whichever RoutingProvider is active for this run — OSRM in this sandbox
 * (no GOOGLE_MAPS_SERVER_API_KEY configured), which has no real Tunisia
 * routing graph loaded here either, so `getRouteOptions` legitimately
 * degrades to its single haversine-fallback option. That's still a real,
 * honest exercise of the whole token mint/redeem path — the pure
 * alternative-generation logic itself lives in each RoutingProvider
 * adapter, which has no network-free way to be unit tested (it IS the I/O
 * boundary), matching this codebase's existing "OSRM-unavailable degrades,
 * doesn't fail" precedent (stop-candidates.integration.test.ts).
 */
describe('route-options.service — real Redis', () => {
  const origin = { lat: 36.7992, lng: 10.1811 };
  const destination = { lat: 36.8324, lng: 10.2334 };

  it('returns at least one route option, each with a redeemable token', async () => {
    const { options } = await getRouteOptions(origin, destination);
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.filter((o) => o.recommended)).toHaveLength(1);
    expect(options[0]!.recommended).toBe(true);

    for (const option of options) {
      expect(option.distanceM).toBeGreaterThan(0);
      expect(typeof option.token).toBe('string');
    }
  });

  it('redeems a freshly minted token for the exact origin/destination it was minted for', async () => {
    const { options } = await getRouteOptions(origin, destination);
    const token = options[0]!.token;

    const redeemed = await redeemRouteToken(token, origin, destination);
    expect(redeemed).not.toBeNull();
    expect(redeemed!.distanceM).toBe(options[0]!.distanceM);
    expect(redeemed!.polyline).toBe(options[0]!.polyline);
  });

  it('is one-shot — redeeming the same token twice fails the second time', async () => {
    const { options } = await getRouteOptions(origin, destination);
    const token = options[0]!.token;

    const first = await redeemRouteToken(token, origin, destination);
    expect(first).not.toBeNull();
    const second = await redeemRouteToken(token, origin, destination);
    expect(second).toBeNull();
  });

  it('rejects a token redeemed against a different origin/destination', async () => {
    const { options } = await getRouteOptions(origin, destination);
    const token = options[0]!.token;

    const wrongDestination = { lat: 34.7398, lng: 10.7600 }; // Sfax — nowhere near the real destination
    const redeemed = await redeemRouteToken(token, origin, wrongDestination);
    expect(redeemed).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    const redeemed = await redeemRouteToken(
      '00000000-0000-0000-0000-000000000000',
      origin,
      destination,
    );
    expect(redeemed).toBeNull();
  });
});
