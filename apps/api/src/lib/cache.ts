import { getRedis } from './redis.js';
import { getLogger } from '../config/logger.js';

/**
 * Redis is a CACHE for the request path (routes, geocoding sessions, stop
 * candidates, route-selection tokens) — never a dependency a request can
 * fail on. A real production incident: the Upstash plan hit its monthly
 * request limit ("ERR max requests limit exceeded"), every cache read threw,
 * and POST /rides returned 500 for every driver. These helpers treat any
 * Redis failure exactly like a cache miss / a skipped write, so a Redis
 * outage only costs extra upstream calls, never a failed request.
 */

// One warning per minute is enough to see the outage without flooding logs
// (or Sentry) with one line per request.
const WARN_INTERVAL_MS = 60_000;
let lastWarnAt = 0;

function warnDegraded(err: unknown, op: string): void {
  const now = Date.now();
  if (now - lastWarnAt < WARN_INTERVAL_MS) return;
  lastWarnAt = now;
  getLogger().warn({ err, op }, 'Redis cache unavailable — continuing without cache');
}

/** Cached value for `key`, or null on a miss, when Redis isn't configured,
 *  or when Redis fails. Never throws. */
export async function cacheGet(key: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch (err) {
    warnDegraded(err, 'get');
    return null;
  }
}

/** Parsed JSON cached value, or null (miss / unavailable / unparseable). */
export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Stores `value` for `ttlSec`; returns whether it was stored. Never throws. */
export async function cacheSet(key: string, value: string, ttlSec: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.set(key, value, 'EX', ttlSec);
    return true;
  } catch (err) {
    warnDegraded(err, 'set');
    return false;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSec: number): Promise<boolean> {
  return cacheSet(key, JSON.stringify(value), ttlSec);
}

/** Deletes `key`; never throws. */
export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    warnDegraded(err, 'del');
  }
}

/** Redis-backed memoization; falls through to a plain call when Redis isn't
 *  configured or is failing. */
export async function cached<T>(
  key: string,
  ttlSec: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGetJson<T>(key);
  if (hit !== null) return hit;
  const value = await fetcher();
  await cacheSetJson(key, value, ttlSec);
  return value;
}
