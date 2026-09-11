import type { FastifyInstance } from 'fastify';
import { registry } from '../../lib/metrics.js';

/**
 * Registered UNPREFIXED (not under API_PREFIX) — Prometheus scrape configs
 * universally expect a bare `/metrics`, the same convention this codebase
 * already follows for `/auth/google/*` (google-auth.routes.ts) needing to
 * match an external system's fixed expectation rather than this app's own
 * `/api/v1` convention.
 */
export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/metrics', async (_request, reply) => {
    reply.type(registry.contentType);
    return registry.metrics();
  });
}
