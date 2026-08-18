import { z } from 'zod';
import { RATING_ROLES } from '@vaya/domain';

export const createRatingSchema = z.object({
  tripId: z.string().uuid(),
  role: z.enum(RATING_ROLES),
  stars: z.coerce.number().int().min(1).max(5),
  punctualityFlag: z.coerce.boolean().optional(),
  comment: z.string().max(500).optional(),
});
export type CreateRatingInput = z.infer<typeof createRatingSchema>;
