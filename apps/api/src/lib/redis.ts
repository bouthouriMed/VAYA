import Redis from 'ioredis';
import { getEnv } from '../config/env.js';
import { getLogger } from '../config/logger.js';

let _redis: Redis | null = null;

export function getRedis(): Redis | null {
  const env = getEnv();
  if (!env.REDIS_URL) {
    return null;
  }
  if (!_redis) {
    _redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    _redis.on('error', (err) => {
      getLogger().error({ err }, 'Redis connection error');
    });
    _redis.on('connect', () => {
      getLogger().info('Redis connected');
    });
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
