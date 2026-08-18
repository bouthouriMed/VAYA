import { z } from 'zod';

export const createBookingSchema = z.object({
  seatsRequested: z.coerce.number().int().min(1).max(8),
  pickup: z.object({
    label: z.string().min(1).max(140),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
