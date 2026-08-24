import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createRideSchema,
  updateRideSchema,
  updateRideStopsSchema,
  addCustomStopSchema,
  routeOptionsRequestSchema,
} from '@vaya/validation';
import { RIDE_STATUSES } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import {
  cancelRide,
  createRide,
  getRideById,
  listMyRides,
  publishRide,
  updateRide,
} from './rides.service.js';
import {
  generateCandidateStopsForRide,
  updateDriverStopSelection,
  listSelectedRideStops,
  listRideStopsForDriver,
  addCustomStop,
} from './stop-candidates.service.js';
import { getRouteOptions } from './route-options.service.js';

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
  // Route-selection step: which kind of route alternative the driver
  // picked, or null (created before this feature existed, or the token had
  // expired) — see db/schema/rides.schema.ts's doc comment.
  routeKind: z.string().nullable(),
});

// Phase 6 (docs/domain/pricing.md): the computed bounded price suggestion,
// returned alongside the ride on create/update so the client never needs a
// second round-trip to render the price step's bounds.
const suggestedPriceSchema = z.object({
  min: z.number(),
  recommended: z.number(),
  max: z.number(),
});

const rideWithPricingSchema = rideSchema.extend({
  pricing: suggestedPriceSchema,
  routeIsEstimate: z.boolean(),
});

const rideIdParamSchema = z.object({ rideId: z.string().uuid() });

// Route-selection step (route-options.service.ts): a small set of real,
// distinct route alternatives for a not-yet-created ride, each redeemable
// via `routeToken` on POST /rides.
const routeOptionSchema = z.object({
  token: z.string(),
  kind: z.enum(['fastest', 'no_tolls', 'no_highways', 'alternative']),
  label: z.string(),
  distanceM: z.number(),
  durationSec: z.number(),
  polyline: z.string(),
  isEstimate: z.boolean(),
  hasTolls: z.boolean().nullable(),
  recommended: z.boolean(),
});

const routeOptionsResponseSchema = z.object({
  options: z.array(routeOptionSchema),
});

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
      schema: { body: createRideSchema, response: { 200: rideWithPricingSchema } },
    },
    async (request, reply) => {
      const ride = await createRide(db, getUserId(request), request.body);
      reply.send(ride);
    },
  );

  // Route-selection step: stateless (no rideId — a ride doesn't exist yet),
  // called right after the driver confirms origin/destination/date/seats.
  // Authenticated (not public) to keep the routing-provider call budget
  // scoped to signed-in users, consistent with how the rest of the
  // ride-creation flow is gated.
  app.post(
    '/rides/route-options',
    {
      onRequest: [fastify.authenticate],
      schema: { body: routeOptionsRequestSchema, response: { 200: routeOptionsResponseSchema } },
    },
    async (request, reply) => {
      const result = await getRouteOptions(
        { lat: request.body.origin.lat, lng: request.body.origin.lng },
        { lat: request.body.destination.lat, lng: request.body.destination.lng },
      );
      reply.send(result);
    },
  );

  // Phase 6: lets the driver adjust the price (within the server-recomputed
  // bound) — or edit departure/seats — before publishing. See
  // rides.service.ts's updateRide doc comment for why this is draft-only.
  app.patch(
    '/rides/:rideId',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: rideIdParamSchema,
        body: updateRideSchema,
        response: { 200: rideWithPricingSchema },
      },
    },
    async (request, reply) => {
      const ride = await updateRide(db, request.params.rideId, getUserId(request), request.body);
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

  // Public — mirrors GET /rides/:rideId/stops and /fellow-passengers' guest-
  // reachable default: a browsing (not yet signed-in) rider needs to see
  // ride details before Demander une place, which is where the real
  // contextual-auth gate lives. No identity-scoped data returned here.
  app.get(
    '/rides/:rideId',
    {
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

  // A freehand pickup/dropoff pin that didn't match any generated
  // candidate — persists it as a real, immediately-selected route_stop
  // (stop-candidates.service.ts's addCustomStop) rather than leaving it as
  // display-only publish-screen state that vanishes once the driver
  // navigates away.
  app.post(
    '/rides/:rideId/stops/custom',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: rideIdParamSchema,
        body: addCustomStopSchema,
        response: { 200: routeStopSchema },
      },
    },
    async (request, reply) => {
      const stop = await addCustomStop(db, request.params.rideId, getUserId(request), request.body);
      reply.send(stop);
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
