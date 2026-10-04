import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A minimal in-memory stand-in for Redis, so the provider's real cache keys
// and TTL paths run end to end.
const store = new Map<string, string>();
vi.mock('../../../../lib/redis.js', () => ({
  getRedis: () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
  }),
}));
vi.mock('../../../../config/logger.js', () => ({ getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

const fetchMock = vi.fn();

const lacResult = {
  place_id: 1,
  osm_type: 'relation',
  osm_id: 12345,
  lat: '36.851',
  lon: '10.272',
  display_name: 'Lac 2, Tunis, Tunisia',
  class: 'place',
  type: 'suburb',
  address: { suburb: 'Lac 2', city: 'Tunis', country_code: 'tn' },
};

beforeEach(() => {
  store.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('/reverse') ? lacResult : [lacResult]),
  }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** OSM's Nominatim usage policy requires clients to cache results. */
describe('NominatimProvider caching', () => {
  it('answers the same typed search from cache (case and spacing ignored)', async () => {
    const { NominatimProvider } = await import('../nominatim.provider.js');
    const provider = new NominatimProvider(true);
    const first = await provider.autocomplete('Lac 2', 'session-a');
    const second = await provider.autocomplete('  lac   2 ', 'session-b');
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The new session can still resolve the place it was shown.
    await expect(provider.resolveLocation(second[0]!.placeId, 'session-b')).resolves.not.toBeNull();
  });

  it('answers reverse lookups within ~11 m from cache, keeping the exact requested point', async () => {
    const { NominatimProvider } = await import('../nominatim.provider.js');
    const provider = new NominatimProvider(true);
    await provider.reverseGeocode(36.85101, 10.27204);
    const second = await provider.reverseGeocode(36.85098, 10.27196);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ latitude: 36.85098, longitude: 10.27196 });
  });
});
