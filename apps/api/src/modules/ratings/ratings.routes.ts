import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createRatingSchema, idParamSchema } from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { createRating, getRatingsSummary } from './ratings.service.js';

export async function ratingsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  app.post(
    '/ratings',
    {
      onRequest: [fastify.authenticate],
      schema: { body: createRatingSchema, response: { 200: z.object({ id: z.string().uuid() }) } },
    },
    async (request, reply) => {
      const rating = await createRating(db, getUserId(request), request.body);
      reply.send({ id: rating.id });
    },
  );

  app.get(
    '/users/:id/ratings-summary',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: z.object({ count: z.number(), average: z.number() }) },
      },
    },
    async (request, reply) => {
      const summary = await getRatingsSummary(db, request.params.id);
      reply.send(summary);
    },
  );
}
