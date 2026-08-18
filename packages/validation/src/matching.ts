import { z } from 'zod';

export const matchingSearchSchema = z.object({
  originLat: z.coerce.number().min(-90).max(90),
  originLng: z.coerce.number().min(-180).max(180),
  destinationLat: z.coerce.number().min(-90).max(90),
  destinationLng: z.coerce.number().min(-180).max(180),
  when: z.coerce.date(),
});
export type MatchingSearchInput = z.infer<typeof matchingSearchSchema>;

const geoPointSchema = z.object({
  label: z.string().min(1).max(140),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const notifyMeSchema = z.object({
  origin: geoPointSchema,
  destination: geoPointSchema,
  desiredWindowStart: z.coerce.date(),
  desiredWindowEnd: z.coerce.date(),
});
export type NotifyMeInput = z.infer<typeof notifyMeSchema>;
