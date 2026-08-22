import { z } from 'zod';

const pickupPointSchema = z.object({
  label: z.string().min(1).max(140),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// Ride-engine passenger selection (docs/domain/ride-engine.md): `pickupStopId`
// is the preferred path — the passenger picked one of the ride's
// driver-selected route_stops. `pickup` (free-form coordinates) is kept for
// backward compatibility with legacy rides published before route_stops
// existed. Both are optional here because which one is actually valid
// depends on whether the target ride has any route_stops at all — a
// ride-independent fact this schema can't know. bookings.service.ts's
// createBooking enforces the real per-ride rule server-side; this schema
// only guarantees the request supplies at least one of the two shapes.
export const createBookingSchema = z
  .object({
    seatsRequested: z.coerce.number().int().min(1).max(8),
    pickupStopId: z.string().uuid().optional(),
    pickup: pickupPointSchema.optional(),
    // Phase 13 (docs/roadmap/phase-13-search-engine.md): dropoff-side
    // mirror of pickupStopId, always optional — omitting it means "drop me
    // at the ride's own destination", the behavior every booking had
    // before this field existed. No free-form dropoff-coordinates
    // counterpart: unlike pickup, dropoff has no legacy free-form flow to
    // stay backward-compatible with.
    dropoffStopId: z.string().uuid().optional(),
  })
  .refine((data) => Boolean(data.pickupStopId) || Boolean(data.pickup), {
    message: 'Provide either pickupStopId or pickup coordinates',
    path: ['pickupStopId'],
  });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
