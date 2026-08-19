import { z } from 'zod';

export const recurringPatternIdParamSchema = z.object({
  patternId: z.string().uuid(),
});
export type RecurringPatternIdParam = z.infer<typeof recurringPatternIdParamSchema>;

// Phase 11 (docs/roadmap/phase-11-recurring-rides.md): PATCH
// /recurring-patterns/:id body. `enable`/`dismiss` map onto
// @vaya/domain's canTransitionRecurringPatternStatus — the actual
// transition legality (e.g. a dismissed pattern can't be enabled directly
// by the user) is enforced there, not duplicated in this schema.
export const updateRecurringPatternSchema = z.object({
  action: z.enum(['enable', 'dismiss']),
});
export type UpdateRecurringPatternInput = z.infer<typeof updateRecurringPatternSchema>;
