import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@vaya/config';

export const updateMeSchema = z.object({
  fullName: z.string().min(2).max(80).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  // Relative, not absolute — /uploads returns a relative path by design
  // (apps/api/src/modules/uploads/uploads.routes.ts), so this must accept
  // that shape rather than requiring a full URL.
  avatarFileUrl: z.string().min(1).optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
