import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createRideSchema } from '@vaya/validation';
import { RIDE_STATUSES } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { cancelRide, createRide, getRideById, listMyRides } from './rides.service.js';

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
}
