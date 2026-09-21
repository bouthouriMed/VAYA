import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { getDatabase } from '../../lib/database.js';
import { getRedis } from '../../lib/redis.js';

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

    // Redis check
    const redis = getRedis();
    if (redis) {
      try {
        await redis.ping();
        checks.redis = { status: 'healthy' };
      } catch {
        checks.redis = { status: 'unhealthy' };
      }
    } else {
      checks.redis = { status: 'not_configured' };
    }

    const allHealthy = Object.values(checks).every(
      (c) => c.status === 'healthy' || c.status === 'not_configured',
    );

    reply.status(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'ok' : 'degraded',
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
