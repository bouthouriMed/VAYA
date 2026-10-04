import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { getDatabase } from '../../lib/database.js';
import { getRedis } from '../../lib/redis.js';

const REDIS_HEALTH_TTL_MS = 5 * 60_000;
let redisHealthCache: { status: string; checkedAt: number } | null = null;

async function redisHealth(): Promise<{ status: string }> {
  const redis = getRedis();
  if (!redis) return { status: 'not_configured' };
  if (redisHealthCache && Date.now() - redisHealthCache.checkedAt < REDIS_HEALTH_TTL_MS) {
    return { status: redisHealthCache.status };
  }
  let status = 'healthy';
  try {
    await redis.ping();
  } catch {
    status = 'unhealthy';
  }
  redisHealthCache = { status, checkedAt: Date.now() };
  return { status };
}

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_request, reply) => {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};

    // Database check
    try {
      const db = getDatabase();
      await db.execute(sql`SELECT 1`);
      checks.database = { status: 'healthy' };
    } catch {
      checks.database = { status: 'unhealthy' };
    }

    // Redis check — informational only. Redis backs a best-effort cache,
    // the job queue and live-tracking fan-out; the API serves requests
    // without it (lib/cache.ts), so a Redis outage reports `degraded` but
    // must not fail this route — the Docker HEALTHCHECK reads it, and a 503
    // here would mark a perfectly working API unhealthy. The result is
    // remembered for a few minutes: on a request-metered Redis (Upstash)
    // a PING every 30s healthcheck alone is ~86k requests a month.
    checks.redis = await redisHealth();

    const databaseHealthy = checks.database?.status === 'healthy';
    const status = databaseHealthy && checks.redis.status !== 'unhealthy' ? 'ok' : 'degraded';

    reply.status(databaseHealthy ? 200 : 503).send({
      status,
      // No version/environment/latency here (VAYA-SEC-017): this route is
      // anonymous and proxied publicly, and those fields only help an
      // attacker fingerprint the deployment. Liveness/readiness is the status.
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  fastify.get('/health/ready', async (_request, reply) => {
    try {
      const db = getDatabase();
      await db.execute(sql`SELECT 1`);
      reply.status(200).send({ status: 'ready' });
    } catch {
      reply.status(503).send({ status: 'not_ready' });
    }
  });

  fastify.get('/health/live', async (_request, reply) => {
    reply.status(200).send({ status: 'alive' });
  });
}
