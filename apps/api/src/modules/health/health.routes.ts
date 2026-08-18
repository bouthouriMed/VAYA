import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { getDatabase } from '../../lib/database.js';
import { getRedis } from '../../lib/redis.js';
import { getEnv } from '../../config/env.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_request, reply) => {
    const env = getEnv();
    const checks: Record<string, { status: string; latencyMs?: number }> = {};

    // Database check
    try {
      const db = getDatabase();
      const start = Date.now();
      await db.execute(sql`SELECT 1`);
      checks.database = { status: 'healthy', latencyMs: Date.now() - start };
    } catch {
      checks.database = { status: 'unhealthy' };
    }

    // Redis check
    const redis = getRedis();
    if (redis) {
      try {
        const start = Date.now();
        await redis.ping();
        checks.redis = { status: 'healthy', latencyMs: Date.now() - start };
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
      version: '0.1.0',
      environment: env.NODE_ENV,
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
