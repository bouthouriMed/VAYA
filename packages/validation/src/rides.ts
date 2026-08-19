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
  contributionPerSeat: z.coerce.number().positive(),
});
export type CreateRideInput = z.infer<typeof createRideSchema>;

export const updateRideSchema = z.object({
  departureAt: z.coerce.date().optional(),
  seatsTotal: z.coerce.number().int().min(1).max(8).optional(),
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
