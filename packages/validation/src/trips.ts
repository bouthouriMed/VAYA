import { z } from 'zod';

export const livePositionSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  progressRatio: z.number().min(0).max(1),
  etaSeconds: z.number().int().min(0),
});
export type LivePosition = z.infer<typeof livePositionSchema>;
