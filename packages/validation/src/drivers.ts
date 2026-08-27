import { z } from 'zod';
import { VERIFICATION_DOCUMENT_TYPES } from '@vaya/domain';

export const createDriverOnboardingSchema = z.object({
  vehicle: z.object({
    make: z.string().min(1).max(40),
    model: z.string().min(1).max(40),
    color: z.string().min(1).max(30),
    plateNumber: z.string().min(4).max(20),
    seatCount: z.coerce.number().int().min(1).max(8),
    photoFileUrl: z.string().url().optional(),
  }),
  documents: z
    .array(
      z.object({
        type: z.enum(VERIFICATION_DOCUMENT_TYPES),
        fileUrl: z.string().url(),
      }),
    )
    .min(1),
  bio: z.string().max(300).optional(),
});
export type CreateDriverOnboardingInput = z.infer<typeof createDriverOnboardingSchema>;

export const resubmitVerificationSchema = z.object({
  documents: z
    .array(
      z.object({
        type: z.enum(VERIFICATION_DOCUMENT_TYPES),
        fileUrl: z.string().url(),
      }),
    )
    .min(1),
  bio: z.string().max(300).optional(),
});
export type ResubmitVerificationInput = z.infer<typeof resubmitVerificationSchema>;

export const updateVehicleSchema = z.object({
  make: z.string().min(1).max(40).optional(),
  model: z.string().min(1).max(40).optional(),
  color: z.string().min(1).max(30).optional(),
  plateNumber: z.string().min(4).max(20).optional(),
  seatCount: z.coerce.number().int().min(1).max(8).optional(),
  photoFileUrl: z.string().url().optional(),
});
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
