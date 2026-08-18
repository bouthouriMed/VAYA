import { getRedis } from '../../lib/redis.js';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
// Nominatim's usage policy requires a descriptive User-Agent identifying the app.
// TODO: replace with a real contact address before any production traffic.
const USER_AGENT = 'VAYA-dev/0.1 (contact: dev@vaya.local)';
const CACHE_TTL_SEC = 3600;
const TUNISIA_VIEWBOX = '7.5,37.6,11.6,30.2'; // lonMin,latMax,lonMax,latMin — biases results to Tunisia

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

interface NominatimSearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (redis) {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  }
  const value = await fetcher();
  if (redis) await redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SEC);
  return value;
}

export async function searchAddress(query: string): Promise<GeocodeResult[]> {
  return cached(`geocode:search:${query.toLowerCase()}`, async () => {
    const url = new URL(`${NOMINATIM_BASE_URL}/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '5');
    url.searchParams.set('viewbox', TUNISIA_VIEWBOX);
    url.searchParams.set('bounded', '1');

    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`Nominatim search failed: ${response.status}`);

    const results = (await response.json()) as NominatimSearchResult[];
    return results.map((r) => ({
      label: r.display_name,
      lat: Number.parseFloat(r.lat),
      lng: Number.parseFloat(r.lon),
    }));
  });
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
  const roundedLat = lat.toFixed(4);
  const roundedLng = lng.toFixed(4);
  return cached(`geocode:reverse:${roundedLat}:${roundedLng}`, async () => {
    const url = new URL(`${NOMINATIM_BASE_URL}/reverse`);
    url.searchParams.set('lat', roundedLat);
    url.searchParams.set('lon', roundedLng);
    url.searchParams.set('format', 'json');

    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`Nominatim reverse geocode failed: ${response.status}`);

    const result = (await response.json()) as NominatimSearchResult;
    return { label: result.display_name, lat, lng };
  });
}
