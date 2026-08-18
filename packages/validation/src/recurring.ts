import { z } from 'zod';

export const recurringPatternIdParamSchema = z.object({
  patternId: z.string().uuid(),
});
export type RecurringPatternIdParam = z.infer<typeof recurringPatternIdParamSchema>;
