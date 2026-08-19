import { getRedis } from './redis.js';

/** Redis-backed memoization; falls through to a plain call when Redis isn't configured. */
export async function cached<T>(
  key: string,
  ttlSec: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (redis) {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  }
  const value = await fetcher();
  if (redis) await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
  return value;
}
