import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { geocodeReverseSchema, geocodeSearchSchema } from '@vaya/validation';
import { reverseGeocode, searchAddress } from './geocoding.service.js';

const resultSchema = z.object({ label: z.string(), lat: z.number(), lng: z.number() });

export async function geocodingRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/geocoding/search',
    {
      onRequest: [fastify.authenticate],
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
      onRequest: [fastify.authenticate],
      schema: { querystring: geocodeReverseSchema, response: { 200: resultSchema } },
    },
    async (request, reply) => {
      const result = await reverseGeocode(request.query.lat, request.query.lng);
      reply.send(result);
    },
  );
}
