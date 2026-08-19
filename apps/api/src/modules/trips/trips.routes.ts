import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParamSchema } from '@vaya/validation';
import { TRIP_STATUSES, RATING_ROLES } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { completeTrip, getPendingRatingForUser, getTripByBookingId } from './trips.service.js';

const tripResponseSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  rideId: z.string().uuid(),
  status: z.enum(TRIP_STATUSES),
  simulationStartedAt: z.date().nullable(),
  pickupConfirmedAt: z.date().nullable(),
  dropoffAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  riderSettlementConfirmedAt: z.date().nullable(),
  driverSettlementConfirmedAt: z.date().nullable(),
});

const pendingRatingResponseSchema = z
  .object({
    tripId: z.string().uuid(),
    role: z.enum(RATING_ROLES),
    counterpartName: z.string().nullable(),
    completedAt: z.date(),
  })
  .nullable();

const bookingIdParamSchema = z.object({ bookingId: z.string().uuid() });

export async function tripsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  // GET /bookings/:bookingId/trip — mirrors conversations.routes.ts's
  // "look up by bookingId, not by the row's own id" convention: mobile
  // screens (bookings/settlement.tsx) only ever know the bookingId.
  app.get(
    '/bookings/:bookingId/trip',
    {
      onRequest: [fastify.authenticate],
      schema: { params: bookingIdParamSchema, response: { 200: tripResponseSchema } },
    },
    async (request, reply) => {
      const trip = await getTripByBookingId(db, request.params.bookingId, getUserId(request));
      reply.send(trip);
    },
  );

  app.post(
    '/trips/:id/complete',
    {
      onRequest: [fastify.authenticate],
      schema: { params: idParamSchema, response: { 200: tripResponseSchema } },
    },
    async (request, reply) => {
      const trip = await completeTrip(db, request.params.id, getUserId(request));
      reply.send(trip);
    },
  );

  app.get(
    '/trips/pending-rating',
    {
      onRequest: [fastify.authenticate],
      schema: { response: { 200: pendingRatingResponseSchema } },
    },
    async (request, reply) => {
      const pending = await getPendingRatingForUser(db, getUserId(request));
      reply.send(pending);
    },
  );
}
