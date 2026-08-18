import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParamSchema } from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import { getRouteById } from './routes.service.js';

const routeResponseSchema = z.object({
  id: z.string().uuid(),
  originLabel: z.string(),
  originLat: z.number(),
  originLng: z.number(),
  destinationLabel: z.string(),
  destinationLat: z.number(),
  destinationLng: z.number(),
  distanceKm: z.number(),
  estimatedDurationMin: z.number(),
  minContribution: z.number(),
  recommendedContribution: z.number(),
  maxContribution: z.number(),
});

export async function corridorRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  app.get(
    '/routes/:id',
    {
      onRequest: [fastify.authenticate],
      schema: { params: idParamSchema, response: { 200: routeResponseSchema } },
    },
    async (request, reply) => {
      const route = await getRouteById(db, request.params.id);
      reply.send(route);
    },
  );
}
