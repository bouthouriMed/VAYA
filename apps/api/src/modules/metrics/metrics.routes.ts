import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { registry } from '../../lib/metrics.js';
import { getEnv } from '../../config/env.js';
import { NotFoundError, UnauthorizedError } from '../../lib/errors.js';

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Registered UNPREFIXED (not under API_PREFIX) — Prometheus scrape configs
 * universally expect a bare `/metrics`, the same convention this codebase
 * already follows for `/auth/google/*` (google-auth.routes.ts) needing to
 * match an external system's fixed expectation rather than this app's own
 * `/api/v1` convention.
 *
 * Access control (security sprint 2026-09-21): this endpoint used to be
 * anonymous, and the Caddy reverse proxy forwards every path to the API, so
 * the whole internet could read route names, traffic volume and error rates.
 *  - METRICS_TOKEN set: requires `Authorization: Bearer <token>` (Prometheus'
 *    `authorization` scrape config sends exactly that).
 *  - METRICS_TOKEN unset in production: the route answers 404 — an
 *    unconfigured deployment exposes nothing rather than everything.
 *  - METRICS_TOKEN unset elsewhere (dev/test): open, as before.
 */
export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/metrics', async (request, reply) => {
    const env = getEnv();
    if (env.METRICS_TOKEN) {
      const header = request.headers.authorization;
      const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
      if (!provided || !tokensMatch(provided, env.METRICS_TOKEN)) {
        throw new UnauthorizedError('Metrics token required');
      }
    } else if (env.NODE_ENV === 'production') {
      throw new NotFoundError('Route');
    }
    reply.type(registry.contentType);
    return registry.metrics();
  });
}
