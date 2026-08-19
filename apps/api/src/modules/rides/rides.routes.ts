import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createRideSchema, updateRideStopsSchema } from '@vaya/validation';
import { RIDE_STATUSES } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { cancelRide, createRide, getRideById, listMyRides, publishRide } from './rides.service.js';
import {
  generateCandidateStopsForRide,
  updateDriverStopSelection,
  listSelectedRideStops,
  listRideStopsForDriver,
} from './stop-candidates.service.js';

const rideSchema = z.object({
  id: z.string().uuid(),
  driverProfileId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  routeId: z.string().uuid().nullable(),
  originLabel: z.string(),
  originLat: z.number(),
  originLng: z.number(),
  destinationLabel: z.string(),
  destinationLat: z.number(),
  destinationLng: z.number(),
  departureAt: z.date(),
  seatsTotal: z.number(),
  seatsAvailable: z.number(),
  contributionPerSeat: z.number(),
  status: z.enum(RIDE_STATUSES),
  routePolyline: z.string().nullable(),
  estimatedDurationSec: z.number().nullable(),
});

const rideIdParamSchema = z.object({ rideId: z.string().uuid() });

const routeStopSchema = z.object({
  id: z.string().uuid(),
  rideId: z.string().uuid(),
  sequence: z.number(),
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  roadSnapped: z.boolean(),
  deviationMeters: z.number(),
  deviationSeconds: z.number(),
  suitabilityScore: z.number(),
  roadClass: z.string().nullable(),
  isDriverSelected: z.boolean(),
});

const generateStopsResponseSchema = z.object({
  stops: z.array(routeStopSchema),
  osrmUnavailable: z.boolean(),
  regenerated: z.boolean(),
});

const rideStopsQuerySchema = z.object({
  // Driver's own editing view (every generated candidate, not just the
  // ones currently offered) — requires the driver's own auth, checked
  // inside the handler since the default (unauthenticated) shape must
  // stay open for the passenger-matching path.
  all: z.coerce.boolean().optional(),
});

export async function ridesRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  app.post(
    '/rides',
    {
      onRequest: [fastify.authenticate],
      schema: { body: createRideSchema, response: { 200: rideSchema } },
    },
    async (request, reply) => {
      const ride = await createRide(db, getUserId(request), request.body);
      reply.send(ride);
    },
  );

  app.get(
    '/rides/mine',
    {
      onRequest: [fastify.authenticate],
      schema: { response: { 200: z.array(rideSchema) } },
    },
    async (request, reply) => {
      const results = await listMyRides(db, getUserId(request));
      reply.send(results);
    },
  );

  app.get(
    '/rides/:rideId',
    {
      onRequest: [fastify.authenticate],
      schema: { params: rideIdParamSchema, response: { 200: rideSchema } },
    },
    async (request, reply) => {
      const ride = await getRideById(db, request.params.rideId);
      reply.send(ride);
    },
  );

  app.post(
    '/rides/:rideId/cancel',
    {
      onRequest: [fastify.authenticate],
      schema: { params: rideIdParamSchema, response: { 200: rideSchema } },
    },
    async (request, reply) => {
      const ride = await cancelRide(db, request.params.rideId, getUserId(request));
      reply.send(ride);
    },
  );

  app.post(
    '/rides/:rideId/publish',
    {
      onRequest: [fastify.authenticate],
      schema: { params: rideIdParamSchema, response: { 200: rideSchema } },
    },
    async (request, reply) => {
      const ride = await publishRide(db, request.params.rideId, getUserId(request));
      reply.send(ride);
    },
  );

  // Generation is idempotent given the same route (stop-candidates.service.ts
  // tracks the source polyline hash) — safe for the mobile flow to call
  // once per publish attempt without double-generating.
  app.post(
    '/rides/:rideId/candidate-stops',
    {
      onRequest: [fastify.authenticate],
      schema: { params: rideIdParamSchema, response: { 200: generateStopsResponseSchema } },
    },
    async (request, reply) => {
      const result = await generateCandidateStopsForRide(
        db,
        request.params.rideId,
        getUserId(request),
      );
      reply.send(result);
    },
  );

  app.patch(
    '/rides/:rideId/stops',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: rideIdParamSchema,
        body: updateRideStopsSchema,
        response: { 200: z.array(routeStopSchema) },
      },
    },
    async (request, reply) => {
      const stops = await updateDriverStopSelection(
        db,
        request.params.rideId,
        getUserId(request),
        request.body,
      );
      reply.send(stops);
    },
  );

  // Public/passenger-facing by default (only driver-selected stops); the
  // driver's own editing view (`?all=true`, every generated candidate)
  // requires the driver's own auth — checked here rather than via
  // `onRequest` so the default shape stays open.
  app.get(
    '/rides/:rideId/stops',
    {
      schema: {
        params: rideIdParamSchema,
        querystring: rideStopsQuerySchema,
        response: { 200: z.array(routeStopSchema) },
      },
    },
    async (request, reply) => {
      if (request.query.all) {
        await fastify.authenticate(request, reply);
        const stops = await listRideStopsForDriver(db, request.params.rideId, getUserId(request));
        reply.send(stops);
        return;
      }
      const stops = await listSelectedRideStops(db, request.params.rideId);
      reply.send(stops);
    },
  );
}
