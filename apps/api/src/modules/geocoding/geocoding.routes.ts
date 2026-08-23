import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  autocompleteQuerySchema,
  geocodeReverseSchema,
  locationPointSchema,
  locationPredictionSchema,
  placeDetailsQuerySchema,
} from '@vaya/validation';
import { autocompleteLocation, resolveLocation, reverseGeocode } from './geocoding.service.js';

export async function geocodingRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Public — a browsing (not yet signed-in) rider/driver needs to type an
  // origin/destination before ever hitting a contextual-auth gate. No
  // identity-scoped data involved.

  // Places API (New)'s session-token autocomplete flow (brief §6/§7): the
  // client generates one UUID per search interaction, sends it on every
  // keystroke's autocomplete call, then sends the SAME token to
  // /geocoding/place-details when the user picks a result — that pairing is
  // what lets Google bill the whole interaction as one session instead of
  // N+1 separate calls. Returns predictions only, deliberately no
  // coordinates (Google's Autocomplete never returns them either) — mobile
  // must call /geocoding/place-details after a selection, exactly once.
  app.get(
    '/geocoding/autocomplete',
    {
      schema: {
        querystring: autocompleteQuerySchema,
        response: { 200: z.array(locationPredictionSchema) },
      },
    },
    async (request, reply) => {
      const results = await autocompleteLocation(
        request.query.input,
        request.query.sessionToken,
      );
      reply.send(results);
    },
  );

  // Resolves one prediction into a real LocationPoint (coordinates +
  // classified type). Call exactly once, only after the user selects a
  // prediction — never speculatively for every row in the autocomplete
  // list (brief §7's explicit cost-control rule).
  app.get(
    '/geocoding/place-details',
    {
      schema: {
        querystring: placeDetailsQuerySchema,
        response: { 200: locationPointSchema.nullable() },
      },
    },
    async (request, reply) => {
      const result = await resolveLocation(request.query.placeId, request.query.sessionToken);
      reply.send(result);
    },
  );

  // Reverse geocoding for an exact coordinate — no session-token concept
  // (not part of Google's Autocomplete+Details session-billing model at
  // all). Used to label a driver's route_stop and the mobile "confirm your
  // pickup pin" flows.
  app.get(
    '/geocoding/reverse',
    {
      schema: {
        querystring: geocodeReverseSchema,
        response: { 200: z.object({ label: z.string(), lat: z.number(), lng: z.number() }) },
      },
    },
    async (request, reply) => {
      const result = await reverseGeocode(request.query.lat, request.query.lng);
      reply.send(result);
    },
  );
}
