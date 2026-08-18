import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@vaya/config';

export const updateMeSchema = z.object({
  fullName: z.string().min(2).max(80).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  avatarFileUrl: z.string().url().optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
