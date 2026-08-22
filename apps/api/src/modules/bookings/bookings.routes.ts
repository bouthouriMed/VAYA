import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createBookingSchema } from '@vaya/validation';
import { BOOKING_STATUSES, CANCELLATION_TIERS } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import {
  acceptBooking,
  cancelBooking,
  createBooking,
  declineBooking,
  listFellowPassengers,
  listMyBookings,
  listRequestsForRide,
  previewBookingCancellation,
  reportNoShow,
} from './bookings.service.js';

const bookingResponseSchema = z.object({
  id: z.string().uuid(),
  rideId: z.string().uuid(),
  riderId: z.string().uuid(),
  seatsRequested: z.number(),
  contributionTotal: z.number(),
  status: z.enum(BOOKING_STATUSES),
  pickupStopId: z.string().uuid().nullable(),
  pickupLabel: z.string(),
  pickupLat: z.number(),
  pickupLng: z.number(),
  requestedAt: z.date(),
  respondedAt: z.date().nullable(),
  // Only populated by GET /rides/:rideId/requests (driver view) — who is
  // asking, so the driver's request sheet isn't a list of opaque UUIDs.
  rider: z
    .object({
      id: z.string().uuid(),
      fullName: z.string(),
      avatarUrl: z.string().nullable(),
    })
    .optional(),
  // Only populated by GET /bookings/mine, which fetches the ride for
  // display purposes — other endpoints return the bare booking row.
  ride: z
    .object({
      originLabel: z.string(),
      destinationLabel: z.string(),
      departureAt: z.date(),
      contributionPerSeat: z.number(),
      driverFullName: z.string().nullable(),
    })
    .optional(),
});

const rideIdParamSchema = z.object({ rideId: z.string().uuid() });
const bookingIdParamSchema = z.object({ bookingId: z.string().uuid() });

const fellowPassengerResponseSchema = z.object({
  userId: z.string().uuid(),
  firstName: z.string(),
  avatarUrl: z.string().nullable(),
  ratingAvg: z.number(),
});

// Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md).
const cancellationPolicySchema = z.object({
  tier: z.enum(CANCELLATION_TIERS),
  minutesBeforeDeparture: z.number(),
  penaltyPoints: z.number(),
  consequence: z.string(),
});

const cancelBookingResponseSchema = bookingResponseSchema.extend({
  cancellationPolicy: cancellationPolicySchema,
});

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

  // Public — no auth, mirrors GET /rides/:rideId/stops' passenger-facing
  // default. Only accepted bookings, only first name + rating, never a
  // pending/declined request or any contact info.
  app.get(
    '/rides/:rideId/fellow-passengers',
    {
      schema: { params: rideIdParamSchema, response: { 200: z.array(fellowPassengerResponseSchema) } },
    },
    async (request, reply) => {
      const passengers = await listFellowPassengers(db, request.params.rideId);
      reply.send(passengers);
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

  // Phase 10: a read-only preview of the policy tier/consequence that would
  // apply *right now* — the mobile cancellation sheet calls this before the
  // user confirms, so the consequence is shown before the destructive POST
  // below, never discovered only after it (see bookings.service.ts's
  // previewBookingCancellation doc comment for why a separate GET, not a
  // dry-run flag on the POST).
  app.get(
    '/bookings/:bookingId/cancellation-preview',
    {
      onRequest: [fastify.authenticate],
      schema: { params: bookingIdParamSchema, response: { 200: cancellationPolicySchema } },
    },
    async (request, reply) => {
      const policy = await previewBookingCancellation(db, request.params.bookingId, getUserId(request));
      reply.send(policy);
    },
  );

  app.post(
    '/bookings/:bookingId/cancel',
    {
      onRequest: [fastify.authenticate],
      schema: { params: bookingIdParamSchema, response: { 200: cancelBookingResponseSchema } },
    },
    async (request, reply) => {
      const { booking, cancellationPolicy } = await cancelBooking(
        db,
        request.params.bookingId,
        getUserId(request),
      );
      reply.send({ ...booking, cancellationPolicy });
    },
  );

  app.post(
    '/bookings/:bookingId/report-no-show',
    {
      onRequest: [fastify.authenticate],
      schema: { params: bookingIdParamSchema, response: { 200: bookingResponseSchema } },
    },
    async (request, reply) => {
      const booking = await reportNoShow(db, request.params.bookingId, getUserId(request));
      reply.send(booking);
    },
  );
}
