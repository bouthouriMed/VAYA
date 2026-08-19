import { z } from 'zod';
import { RATING_ROLES } from '@vaya/domain';

// Phase 9 (docs/roadmap/phase-09-ratings-trust.md): `tripId` now comes from
// the URL (`POST /trips/:id/ratings`), not the body, matching the phase
// doc's exact API shape — the same "id in the route, not duplicated in the
// body" convention conversations.routes.ts already uses.
export const createRatingSchema = z.object({
  role: z.enum(RATING_ROLES),
  stars: z.coerce.number().int().min(1).max(5),
  punctualityFlag: z.coerce.boolean().optional(),
  comment: z.string().max(500).optional(),
});
export type CreateRatingInput = z.infer<typeof createRatingSchema>;
