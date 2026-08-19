import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { matchingSearchSchema, notifyMeSchema } from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { corridorFallback, createDemandSignal, searchRides } from './matching.service.js';

const rankedStopSchema = z.object({
  stopId: z.string().uuid(),
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  walkMinutes: z.number(),
});

const matchCandidateSchema = z.object({
  rideId: z.string().uuid(),
  driverUserId: z.string().uuid(),
  driverFullName: z.string().nullable(),
  ratingAvg: z.number(),
  tripCount: z.number(),
  departureAt: z.date(),
  seatsAvailable: z.number(),
  contributionPerSeat: z.number(),
  pickupWalkMinutes: z.number(),
  routeOverlapPercent: z.number(),
  score: z.number(),
  reasons: z.array(z.string()),
  clusterLabel: z.string(),
  originLat: z.number(),
  originLng: z.number(),
  destinationLat: z.number(),
  destinationLng: z.number(),
  routePolyline: z.string().nullable(),
  rankedStops: z.array(rankedStopSchema),
  pickupViable: z.boolean(),
});

export async function matchingRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  app.get(
    '/matching/search',
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: matchingSearchSchema,
        response: { 200: z.array(matchCandidateSchema) },
      },
    },
    async (request, reply) => {
      const results = await searchRides(db, request.query);
      reply.send(results);
    },
  );

  app.get(
    '/matching/corridor-fallback',
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: matchingSearchSchema,
        response: {
          200: z.object({
            nearbyRides: z.array(matchCandidateSchema),
            demandSignalCount: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const result = await corridorFallback(db, request.query);
      reply.send(result);
    },
  );

  app.post(
    '/matching/notify-me',
    {
      onRequest: [fastify.authenticate],
      schema: { body: notifyMeSchema, response: { 200: z.object({ id: z.string().uuid() }) } },
    },
    async (request, reply) => {
      const signal = await createDemandSignal(db, getUserId(request), request.body);
      reply.send({ id: signal.id });
    },
  );
}
