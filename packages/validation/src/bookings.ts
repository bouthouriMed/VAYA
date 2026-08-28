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
// existed, AND (matching-engine detour_match tier) as the real pickup point
// for a driver-detour booking on a ride that DOES have stops elsewhere —
// bookings.service.ts's createBooking independently re-validates that case
// via a real, live routing-engine detour check before accepting it, never
// trusting the client's claim. Both are optional here because which one is
// actually valid depends on the target ride's own state — a fact this
// schema can't know; createBooking enforces the real per-ride rule
// server-side, this schema only guarantees the request supplies at least
// one of the two pickup shapes.
export const createBookingSchema = z
  .object({
    seatsRequested: z.coerce.number().int().min(1).max(8),
    pickupStopId: z.string().uuid().optional(),
    pickup: pickupPointSchema.optional(),
    // Phase 13 (docs/roadmap/phase-13-search-engine.md): dropoff-side
    // mirror of pickupStopId, always optional — omitting it means "drop me
    // at the ride's own destination", the behavior every booking had
    // before this field existed.
    dropoffStopId: z.string().uuid().optional(),
    // Free-form dropoff-coordinates mirror of `pickup` above — same
    // detour_match reasoning, same createBooking-side live validation.
    // Previously had no counterpart at all (dropoff was always either a
    // real stop or the ride's own destination) — added specifically so a
    // detour-match booking's dropoff can be the passenger's own real
    // requested destination, not just whatever happens to equal the
    // ride's own endpoint.
    dropoff: pickupPointSchema.optional(),
  })
  .refine((data) => Boolean(data.pickupStopId) || Boolean(data.pickup), {
    message: 'Provide either pickupStopId or pickup coordinates',
    path: ['pickupStopId'],
  });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
