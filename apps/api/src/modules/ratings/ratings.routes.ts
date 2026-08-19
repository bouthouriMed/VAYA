import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createRatingSchema, idParamSchema } from '@vaya/validation';
import { TRUST_TIERS } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { createRating, getTrustSummary } from './ratings.service.js';

const ratingResponseSchema = z.object({ id: z.string().uuid() });

const tierAggregateSchema = z.object({
  tier: z.enum(TRUST_TIERS),
  ratingAvg: z.number(),
  tripCount: z.number(),
  punctualityScore: z.number(),
});

const trustSummaryResponseSchema = z.object({
  userId: z.string().uuid(),
  driver: tierAggregateSchema.nullable(),
  rider: tierAggregateSchema.nullable(),
});

export async function ratingsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  // POST /trips/:id/ratings — tripId comes from the URL, matching the
  // phase doc's exact API shape (docs/roadmap/phase-09-ratings-trust.md).
  app.post(
    '/trips/:id/ratings',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        body: createRatingSchema,
        response: { 200: ratingResponseSchema },
      },
    },
    async (request, reply) => {
      const rating = await createRating(db, request.params.id, getUserId(request), request.body);
      reply.send({ id: rating.id });
    },
  );

  app.get(
    '/users/:id/trust-summary',
    {
      onRequest: [fastify.authenticate],
      schema: { params: idParamSchema, response: { 200: trustSummaryResponseSchema } },
    },
    async (request, reply) => {
      const summary = await getTrustSummary(db, request.params.id);
      reply.send(summary);
    },
  );
}
