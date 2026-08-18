import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createBookingSchema } from '@vaya/validation';
import { BOOKING_STATUSES } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import {
  acceptBooking,
  cancelBooking,
  createBooking,
  declineBooking,
  listMyBookings,
  listRequestsForRide,
} from './bookings.service.js';

const bookingResponseSchema = z.object({
  id: z.string().uuid(),
  rideId: z.string().uuid(),
  riderId: z.string().uuid(),
  seatsRequested: z.number(),
  contributionTotal: z.number(),
  status: z.enum(BOOKING_STATUSES),
  pickupLabel: z.string(),
  pickupLat: z.number(),
  pickupLng: z.number(),
  requestedAt: z.date(),
  respondedAt: z.date().nullable(),
});

const rideIdParamSchema = z.object({ rideId: z.string().uuid() });
const bookingIdParamSchema = z.object({ bookingId: z.string().uuid() });

export async function bookingsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  app.post(
    '/rides/:rideId/requests',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: rideIdParamSchema,
        body: createBookingSchema,
        response: { 200: bookingResponseSchema },
      },
    },
    async (request, reply) => {
      const booking = await createBooking(
        db,
        request.params.rideId,
        getUserId(request),
        request.body,
      );
      reply.send(booking);
    },
  );

  app.get(
    '/bookings/mine',
    {
      onRequest: [fastify.authenticate],
      schema: { response: { 200: z.array(bookingResponseSchema) } },
    },
    async (request, reply) => {
      const results = await listMyBookings(db, getUserId(request));
      reply.send(results);
    },
  );

  app.get(
    '/rides/:rideId/requests',
    {
      onRequest: [fastify.authenticate],
      schema: { params: rideIdParamSchema, response: { 200: z.array(bookingResponseSchema) } },
    },
    async (request, reply) => {
      const results = await listRequestsForRide(db, request.params.rideId, getUserId(request));
      reply.send(results);
    },
  );

  app.post(
    '/bookings/:bookingId/accept',
    {
      onRequest: [fastify.authenticate],
      schema: { params: bookingIdParamSchema, response: { 200: bookingResponseSchema } },
    },
    async (request, reply) => {
      const booking = await acceptBooking(db, request.params.bookingId, getUserId(request));
      reply.send(booking);
    },
  );

  app.post(
    '/bookings/:bookingId/decline',
    {
      onRequest: [fastify.authenticate],
      schema: { params: bookingIdParamSchema, response: { 200: bookingResponseSchema } },
    },
    async (request, reply) => {
      const booking = await declineBooking(db, request.params.bookingId, getUserId(request));
      reply.send(booking);
    },
  );

  app.post(
    '/bookings/:bookingId/cancel',
    {
      onRequest: [fastify.authenticate],
      schema: { params: bookingIdParamSchema, response: { 200: bookingResponseSchema } },
    },
    async (request, reply) => {
      const booking = await cancelBooking(db, request.params.bookingId, getUserId(request));
      reply.send(booking);
    },
  );
}
