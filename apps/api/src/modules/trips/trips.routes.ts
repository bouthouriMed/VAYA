import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParamSchema } from '@vaya/validation';
import { TRIP_STATUSES, RATING_ROLES, TRACKING_STATUSES } from '@vaya/domain';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../../lib/database.js';
import { users } from '../../db/schema/index.js';
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
  isTripDriver,
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT_RECHECK_INTERVAL_MS = 60_000;

export async function tripsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  /** Throws unless the user exists and is neither suspended nor deleted —
   *  the same conditions `fastify.authenticate` enforces per HTTP request. */
  async function assertAccountActive(userId: string): Promise<void> {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new ForbiddenError('Invalid token');
    if (user.suspendedAt || user.deletedAt) throw new ForbiddenError('Account no longer active');
  }

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
      let isDriver = false;
      let userId: string;
      try {
        const decoded = fastify.jwt.verify<{ sub: string; type?: string }>(request.query.token);
        // Same identity rules as `fastify.authenticate` (app.ts), which this
        // handshake can't use (no Authorization header): admin tokens and the
        // Google OAuth `state` JWT share this signing secret but are not
        // consumer sessions, and a suspended/deleted account must not be able
        // to open a live-location channel with a still-unexpired token.
        if (decoded.type === 'admin' || !UUID_PATTERN.test(decoded.sub)) {
          throw new ForbiddenError('Invalid token');
        }
        userId = decoded.sub;
        await assertAccountActive(userId);
        initialState = await getTrackingState(db, tripId, decoded.sub); // throws Forbidden/NotFound if not a party
        isDriver = await isTripDriver(db, tripId, decoded.sub);
      } catch (err) {
        getLogger().warn({ err, tripId }, 'Rejected unauthorized WS tracking connection');
        socket.close(4401, err instanceof ForbiddenError || err instanceof NotFoundError ? err.message : 'Unauthorized');
        return;
      }

      // M-094/INV-06: the room needs to know this socket's role so
      // subsequent `location` broadcasts (lib/realtime.ts's deliverLocally)
      // can redact raw GPS for a pre-boarding rider — the same rule this
      // `initialState` snapshot already applies via getTrackingState above.
      registerTripSocket(tripId, socket, isDriver);
      socket.send(JSON.stringify({ type: 'snapshot', ...initialState }));

      // A socket outlives the 15-minute access token it authenticated with
      // (a trip can last hours; closing at token expiry would silently drop
      // live tracking to polling), so instead of trusting the handshake
      // forever, re-check every minute that the account is still active and
      // hang up if it was suspended or deleted mid-trip.
      const accountRecheck = setInterval(() => {
        assertAccountActive(userId).catch(() => {
          socket.close(4403, 'Account no longer active');
        });
      }, ACCOUNT_RECHECK_INTERVAL_MS);
      accountRecheck.unref();

      const cleanup = () => {
        clearInterval(accountRecheck);
        unregisterTripSocket(tripId, socket);
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);
    },
  );
}
