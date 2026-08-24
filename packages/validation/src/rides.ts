import { z } from 'zod';

const pointSchema = {
  label: z.string().min(1).max(140),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
};

export const createRideSchema = z.object({
  vehicleId: z.string().uuid(),
  routeId: z.string().uuid().optional(),
  origin: z.object(pointSchema),
  destination: z.object(pointSchema),
  departureAt: z.coerce.date(),
  seatsTotal: z.coerce.number().int().min(1).max(8),
  // Optional as of Phase 6 (docs/domain/pricing.md): the shape of a valid
  // price depends on the route (not known to this static schema, which has
  // no DB/OSRM access), so out-of-bounds rejection happens in
  // rides.service.ts, not here — this schema only enforces "a positive
  // number, if the driver already supplied one." Omitted entirely, the
  // server defaults it to the freshly-computed `recommended` suggestion.
  contributionPerSeat: z.coerce.number().positive().optional(),
  // Phase 11 (docs/roadmap/phase-11-recurring-rides.md): set only by the
  // driver auto-draft confirmation flow, tagging the created ride as
  // originating from an `enabled` recurring pattern (rides.recurringPatternId,
  // already schema-modeled — see docs/domain/model.md). Reuses this same
  // ride-creation endpoint with a pre-filled body rather than a bespoke
  // "confirm auto-draft" endpoint, per the phase doc's explicit scope.
  recurringPatternId: z.string().uuid().optional(),
  // Route-selection step: an opaque token from POST /rides/route-options,
  // redeemed server-side (rides.service.ts's createRide, via
  // route-options.service.ts's redeemRouteToken) for the exact route the
  // driver picked. Never trusted as a source of distance/duration/geometry
  // values itself — only as a lookup key — so a client can't forge a route
  // to manipulate the bounded price. Omitted (or expired/invalid) falls
  // back to the default freshly-computed route, exactly as before this
  // field existed.
  routeToken: z.string().uuid().optional(),
});
export type CreateRideInput = z.infer<typeof createRideSchema>;

// Route-selection step (apps/mobile's publish wizard, between the
// origin/destination form and pickup/dropoff selection): fetches a small
// set of real, distinct route alternatives for a not-yet-created ride.
// Stateless — no rideId, since no ride needs to exist yet.
export const routeOptionsRequestSchema = z.object({
  origin: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  destination: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
});
export type RouteOptionsRequestInput = z.infer<typeof routeOptionsRequestSchema>;

export const updateRideSchema = z.object({
  departureAt: z.coerce.date().optional(),
  seatsTotal: z.coerce.number().int().min(1).max(8).optional(),
  // Same bound-enforcement note as createRideSchema above — the [min, max]
  // check against the route-derived suggestion happens in rides.service.ts.
  contributionPerSeat: z.coerce.number().positive().optional(),
});
export type UpdateRideInput = z.infer<typeof updateRideSchema>;

// Driver's final selection of which generated candidate stops to actually
// offer — docs/domain/ride-engine.md's `PATCH /rides/:id/stops`. Never
// requires a non-empty array: publishing with zero additional stops is a
// valid choice the client simply doesn't call this for.
export const updateRideStopsSchema = z
  .array(
    z.object({
      stopId: z.string().uuid(),
      isDriverSelected: z.boolean(),
    }),
  )
  .max(50);
export type UpdateRideStopsInput = z.infer<typeof updateRideStopsSchema>;

// A freehand pickup/dropoff pin that didn't match any generated route_stop
// candidate — publish.tsx's map-selection flow (Publish Explorer spec §7).
// Persisted as a real route_stop (roadSnapped: false, isDriverSelected:
// true immediately — see stop-candidates.service.ts's addCustomStop) so it
// shows up everywhere a real stop does: the driver's own ride hub, the
// passenger's matching/booking flow. Previously these were display-only
// and vanished the moment the driver left the publish screen.
export const addCustomStopSchema = z.object({
  ...pointSchema,
  role: z.enum(['pickup', 'dropoff']),
});
export type AddCustomStopInput = z.infer<typeof addCustomStopSchema>;
