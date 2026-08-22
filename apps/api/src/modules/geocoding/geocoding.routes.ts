import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { geocodeReverseSchema, geocodeSearchSchema } from '@vaya/validation';
import { reverseGeocode, searchAddress } from './geocoding.service.js';

const resultSchema = z.object({ label: z.string(), lat: z.number(), lng: z.number() });

export async function geocodingRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Public — a browsing (not yet signed-in) rider/driver needs to type an
  // origin/destination before ever hitting a contextual-auth gate. No
  // identity-scoped data involved.
  app.get(
    '/geocoding/search',
    {
      schema: { querystring: geocodeSearchSchema, response: { 200: z.array(resultSchema) } },
    },
    async (request, reply) => {
      const results = await searchAddress(request.query.q);
      reply.send(results);
    },
  );

  app.get(
    '/geocoding/reverse',
    {
      schema: { querystring: geocodeReverseSchema, response: { 200: resultSchema } },
    },
    async (request, reply) => {
      const result = await reverseGeocode(request.query.lat, request.query.lng);
      reply.send(result);
    },
  );
}
