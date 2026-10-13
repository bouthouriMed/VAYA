import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@vaya/config';
import { phoneSchema } from './auth';

export const updateMeSchema = z.object({
  fullName: z.string().min(2).max(80).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  // Relative, not absolute — /uploads returns a relative path by design
  // (apps/api/src/modules/uploads/uploads.routes.ts), so this must accept
  // that shape rather than requiring a full URL.
  avatarFileUrl: z.string().min(1).optional(),
  // Self-declared number so a matched counterpart can call — no OTP (no SMS
  // provider is live yet). Stored apart from the OTP-verified login phone;
  // null clears it.
  contactPhone: phoneSchema.nullable().optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
