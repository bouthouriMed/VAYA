import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { analyticsEventsIngestSchema } from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { ingestAnalyticsEvents } from './analytics.service.js';

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  app.post(
    '/analytics/events',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { body: analyticsEventsIngestSchema, response: { 200: z.object({ ok: z.boolean() }) } },
    },
    async (request, reply) => {
      await ingestAnalyticsEvents(db, getUserId(request), request.body);
      reply.send({ ok: true });
    },
  );
}
