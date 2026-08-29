import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createBookingSchema } from '@vaya/validation';
import { BOOKING_STATUSES, CANCELLATION_REASONS, CANCELLATION_TIERS, RIDE_STATUSES } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import {
  acceptBooking,
  cancelBooking,
  createBooking,
  declineBooking,
  getBookingContactPhone,
  listFellowPassengers,
  listMyBookings,
  listRequestsForRide,
  previewBookingCancellation,
  previewBookingDetour,
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
  // M-004/M-020 (docs/unified_driver_and_passenger_journey.md §5/§13/§16):
  // the real, computed distance from the passenger's own requested point
  // to the resolved pickup — null whenever it wasn't resolved against one
  // (legacy client, or a free-form pickup with no distinct requested point).
  pickupWalkMeters: z.number().nullable(),
  // Phase 13 (docs/roadmap/phase-13-search-engine.md): a real, pre-existing
  // gap fixed in the same pass as the two fields above — these columns
  // have existed on `bookings` since Phase 13 and are populated by
  // createBooking, but were never actually listed in this response schema,
  // so Fastify's response serializer silently stripped them from every
  // booking payload a client ever received (confirmed live: ride-details.tsx
  // already reads `booking.dropoffLabel`/`dropoffLat`/`dropoffLng` from this
  // exact response and had been getting `undefined` for every route-
  // passthrough/detour booking with a real dropoff stop).
  dropoffStopId: z.string().uuid().nullable(),
  dropoffLabel: z.string().nullable(),
  dropoffLat: z.number().nullable(),
  dropoffLng: z.number().nullable(),
  dropoffWalkMeters: z.number().nullable(),
  requestedAt: z.date(),
  respondedAt: z.date().nullable(),
  // M-050/M-054 (docs/unified_driver_and_passenger_journey.md §20): visible
  // to the passenger on their own request and to the driver inside the
  // incoming request — same shape, no role-specific hiding needed.
  expiresAt: z.date().nullable(),
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
      // 2026-08-23 trip-hub redesign: the rider's own bookings list needs
      // the driver's real userId to fetch their public profile (rating,
      // vehicle) for the booking detail screen — driverFullName alone
      // wasn't enough to look anything else up.
      driverUserId: z.string().uuid(),
      // (tabs)/trips.tsx's rider hero card: tells an actually in-progress
      // ride apart from a merely-scheduled one — booking.status alone stays
      // 'accepted' throughout both.
      status: z.enum(RIDE_STATUSES),
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

// M-110 (docs/unified_driver_and_passenger_journey.md §38): "a lightweight
// required reason from a fixed set" — confirmed live this pass that the
// route previously had no body schema at all, so a reason-less cancel
// succeeded unconditionally.
const cancelBookingBodySchema = z.object({ reason: z.enum(CANCELLATION_REASONS) });

// M-102 (docs/unified_driver_and_passenger_journey.md §37): both fields
// optional — a reporter with no GPS fix at report time still gets the
// pure time-only rule (evaluateNoShowReport's documented graceful
// degradation), never a hard requirement to supply location.
const reportNoShowBodySchema = z
  .object({
    reporterLat: z.number().min(-90).max(90).optional(),
    reporterLng: z.number().min(-180).max(180).optional(),
  })
  .default({});

const detourPreviewPointSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  isPlannedStop: z.boolean(),
  deviationMeters: z.number().nullable(),
  deviationSeconds: z.number().nullable(),
  stopIndex: z.number().nullable(),
  totalStops: z.number().nullable(),
});

const detourPreviewResponseSchema = z.object({
  pickup: detourPreviewPointSchema,
  dropoff: detourPreviewPointSchema,
  segment: z.object({
    distanceM: z.number(),
    durationSec: z.number(),
    isEstimate: z.boolean(),
  }),
  pickupTime: z.string(),
  dropoffTime: z.string(),
  newEta: z.string(),
  detourRoutePolyline: z.string().nullable(),
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
      schema: {
        params: bookingIdParamSchema,
        body: cancelBookingBodySchema,
        response: { 200: cancelBookingResponseSchema },
      },
    },
    async (request, reply) => {
      const { booking, cancellationPolicy } = await cancelBooking(
        db,
        request.params.bookingId,
        getUserId(request),
        request.body.reason,
      );
      reply.send({ ...booking, cancellationPolicy });
    },
  );

  // Driver-only "does this fit my route?" preview — GET so it's a pure,
  // side-effect-free read the request-detail sheet can call freely (unlike
  // accept/decline, this never changes anything).
  app.get(
    '/bookings/:bookingId/detour-preview',
    {
      onRequest: [fastify.authenticate],
      schema: { params: bookingIdParamSchema, response: { 200: detourPreviewResponseSchema } },
    },
    async (request, reply) => {
      const preview = await previewBookingDetour(db, request.params.bookingId, getUserId(request));
      reply.send(preview);
    },
  );

  // Reveals the counterpart's phone number for an accepted booking only —
  // never a public lookup (bookings.service.ts's getBookingContactPhone
  // doc comment). `phone: null` is a valid, honest response (a
  // Google-auth-only account has none), not an error.
  app.get(
    '/bookings/:bookingId/contact-phone',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: bookingIdParamSchema,
        response: { 200: z.object({ phone: z.string().nullable() }) },
      },
    },
    async (request, reply) => {
      const contact = await getBookingContactPhone(db, request.params.bookingId, getUserId(request));
      reply.send(contact);
    },
  );

  app.post(
    '/bookings/:bookingId/report-no-show',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: bookingIdParamSchema,
        body: reportNoShowBodySchema,
        response: { 200: bookingResponseSchema },
      },
    },
    async (request, reply) => {
      // M-102 (spec §37): optional — a real GPS fix at report time, or
      // null when the phone has none. `reportNoShow` degrades gracefully
      // either way (see its own doc comment for the full contract).
      const reporterLocation = request.body.reporterLat != null && request.body.reporterLng != null
        ? { lat: request.body.reporterLat, lng: request.body.reporterLng }
        : null;
      const booking = await reportNoShow(db, request.params.bookingId, getUserId(request), reporterLocation);
      reply.send(booking);
    },
  );
}
