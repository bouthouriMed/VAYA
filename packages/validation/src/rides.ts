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
});
export type CreateRideInput = z.infer<typeof createRideSchema>;

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
