import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { matchingSearchSchema, notifyMeSchema } from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { createDemandSignal, searchRides } from './matching.service.js';

const rankedStopSchema = z.object({
  stopId: z.string().uuid(),
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  walkMinutes: z.number(),
});

// Google/PostGIS location spec §7 — populated only for matchType: 'detour'.
const detourInfoSchema = z.object({
  extraDurationSeconds: z.number(),
  extraDistanceMeters: z.number(),
  detourRatio: z.number(),
  pickupEtaSeconds: z.number(),
  dropoffEtaSeconds: z.number(),
});

const matchCandidateSchema = z.object({
  rideId: z.string().uuid(),
  driverUserId: z.string().uuid(),
  driverFullName: z.string().nullable(),
  driverAvatarUrl: z.string().nullable(),
  ratingAvg: z.number(),
  tripCount: z.number(),
  departureAt: z.date(),
  seatsAvailable: z.number(),
  contributionPerSeat: z.number(),
  pickupWalkMinutes: z.number(),
  dropoffWalkMinutes: z.number(),
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
  rankedDropoffStops: z.array(rankedStopSchema),
  pickupViable: z.boolean(),
  dropoffViable: z.boolean(),
  matchType: z.enum(['endpoint', 'route_passthrough', 'detour']),
  detour: detourInfoSchema.nullable(),
});

// Phase 13 (docs/roadmap/phase-13-search-engine.md): one search response now
// carries which tier of the cascade produced it plus a server-built,
// French explanation — replaces the old two-endpoint (matching/search +
// matching/corridor-fallback) client-orchestrated pair with a single round
// trip that never silently returns nothing while a looser tier still has
// results.
const searchResultSchema = z.object({
  tier: z.enum([
    'exact',
    'wide_corridor',
    'route_passthrough',
    'detour_match',
    'closest_departure',
    'none',
  ]),
  candidates: z.array(matchCandidateSchema),
  message: z.string().nullable(),
});

export async function matchingRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  // Public — a browsing (not yet signed-in) rider needs real search results
  // before Demander une place, which is where the real contextual-auth gate
  // lives. Doesn't read getUserId(request) at all.
  app.get(
    '/matching/search',
    {
      schema: {
        querystring: matchingSearchSchema,
        response: { 200: searchResultSchema },
      },
    },
    async (request, reply) => {
      const result = await searchRides(db, request.query);
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
