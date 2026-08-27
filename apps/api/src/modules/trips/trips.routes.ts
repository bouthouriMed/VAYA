import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParamSchema } from '@vaya/validation';
import { TRIP_STATUSES, RATING_ROLES, TRACKING_STATUSES } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { registerTripSocket, unregisterTripSocket } from '../../lib/realtime.js';
import { getLogger } from '../../config/logger.js';
import {
  completeTrip,
  confirmPassengerAboard,
  getPendingRatingForUser,
  getTrackingState,
  getTripByBookingId,
  reportTrackingIssue,
  startTrip,
  updateTripLocation,
} from './trips.service.js';

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
  startedAt: z.date().nullable(),
});

const locationUpdateBodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  headingDeg: z.number().min(0).max(360).nullable().optional(),
  speedMps: z.number().min(0).nullable().optional(),
  accuracyM: z.number().min(0).nullable().optional(),
});

const trackingStateResponseSchema = z.object({
  tripStatus: z.enum(TRIP_STATUSES),
  trackingStatus: z.enum(TRACKING_STATUSES),
  currentLat: z.number().nullable(),
  currentLng: z.number().nullable(),
  currentHeadingDeg: z.number().nullable(),
  currentSpeedMps: z.number().nullable(),
  locationUpdatedAt: z.date().nullable(),
  routePolyline: z.string().nullable(),
  pickup: z.object({ lat: z.number(), lng: z.number(), label: z.string() }),
  destination: z.object({ lat: z.number(), lng: z.number(), label: z.string() }),
});

const locationUpdateResponseSchema = z.object({
  trackingStatus: z.enum(TRACKING_STATUSES),
  tripStatus: z.enum(TRIP_STATUSES),
  etaSec: z.number().nullable(),
  distanceRemainingM: z.number().nullable(),
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

  // --- Live tracking (docs/domain/live-tracking.md) ---

  app.post(
    '/trips/:id/start',
    {
      onRequest: [fastify.authenticate],
      schema: { params: idParamSchema, response: { 200: tripResponseSchema } },
    },
    async (request, reply) => {
      const trip = await startTrip(db, request.params.id, getUserId(request));
      reply.send(trip);
    },
  );

  app.post(
    '/trips/:id/passenger-aboard',
    {
      onRequest: [fastify.authenticate],
      schema: { params: idParamSchema, response: { 200: tripResponseSchema } },
    },
    async (request, reply) => {
      const trip = await confirmPassengerAboard(db, request.params.id, getUserId(request));
      reply.send(trip);
    },
  );

  app.post(
    '/trips/:id/location',
    {
      // A driver's device pings roughly every 6-10s while tracking is
      // active; this bound is a defensive ceiling against a misbehaving
      // client, not the throttling policy itself (that's client-side).
      config: { rateLimit: { max: 20, timeWindow: '10 seconds' } },
      onRequest: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        body: locationUpdateBodySchema,
        response: { 200: locationUpdateResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await updateTripLocation(db, request.params.id, getUserId(request), request.body);
      reply.send({
        trackingStatus: result.trackingStatus,
        tripStatus: result.trip.status,
        etaSec: result.etaSec,
        distanceRemainingM: result.distanceRemainingM,
      });
    },
  );

  app.post(
    '/trips/:id/tracking-issue',
    {
      onRequest: [fastify.authenticate],
      schema: { params: idParamSchema, response: { 200: z.object({ ok: z.boolean() }) } },
    },
    async (request, reply) => {
      await reportTrackingIssue(db, request.params.id, getUserId(request));
      reply.send({ ok: true });
    },
  );

  app.get(
    '/trips/:id/tracking',
    {
      onRequest: [fastify.authenticate],
      schema: { params: idParamSchema, response: { 200: trackingStateResponseSchema } },
    },
    async (request, reply) => {
      const state = await getTrackingState(db, request.params.id, getUserId(request));
      reply.send(state);
    },
  );

  // WebSocket push channel for the tracking screen — REST above remains a
  // fully functional polling fallback (docs/domain/live-tracking.md) if a
  // socket can't connect. Auth via `?token=` (a WS handshake can't easily
  // carry a custom Authorization header from React Native's WebSocket
  // client), verified manually against the same JWT secret as every other
  // route — `fastify.authenticate` isn't usable here since it reads from
  // the Authorization header.
  app.get(
    '/ws/trips/:id',
    { websocket: true, schema: { params: idParamSchema, querystring: z.object({ token: z.string() }) } },
    async (socket, request) => {
      const tripId = request.params.id;
      let initialState;
      try {
        const decoded = fastify.jwt.verify<{ sub: string }>(request.query.token);
        initialState = await getTrackingState(db, tripId, decoded.sub); // throws Forbidden/NotFound if not a party
      } catch (err) {
        getLogger().warn({ err, tripId }, 'Rejected unauthorized WS tracking connection');
        socket.close(4401, err instanceof ForbiddenError || err instanceof NotFoundError ? err.message : 'Unauthorized');
        return;
      }

      registerTripSocket(tripId, socket);
      socket.send(JSON.stringify({ type: 'snapshot', ...initialState }));

      socket.on('close', () => unregisterTripSocket(tripId, socket));
      socket.on('error', () => unregisterTripSocket(tripId, socket));
    },
  );
}
