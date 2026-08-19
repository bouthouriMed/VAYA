import { z } from 'zod';

export const geocodeSearchSchema = z.object({
  q: z.string().min(2).max(200),
});
export type GeocodeSearchInput = z.infer<typeof geocodeSearchSchema>;

export const geocodeReverseSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type GeocodeReverseInput = z.infer<typeof geocodeReverseSchema>;

export const geocodeResultSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;
