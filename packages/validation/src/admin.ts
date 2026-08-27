import { z } from 'zod';
import { VERIFICATION_DECLINE_REASONS } from '@vaya/domain';

// Local, not imported from './index' — that file does `export * from
// './admin'`, and importing back from it here would create a module
// evaluation cycle within this package for no real benefit (this is the
// only file using pagination on this shape today).
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const adminUsersQuerySchema = paginationSchema.extend({
  q: z.string().min(1).max(200).optional(),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const suspendUserSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const adminRidesQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  q: z.string().min(1).max(200).optional(),
});
export type AdminRidesQuery = z.infer<typeof adminRidesQuerySchema>;

export const adminCancelRideSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type AdminCancelRideInput = z.infer<typeof adminCancelRideSchema>;

export const verificationQueueQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
});
export type VerificationQueueQuery = z.infer<typeof verificationQueueQuerySchema>;

export const approveVerificationSchema = z.object({
  notes: z.string().max(1000).optional(),
});
export type ApproveVerificationInput = z.infer<typeof approveVerificationSchema>;

export const declineVerificationSchema = z.object({
  outcome: z.enum(['rejected', 'resubmission_required']),
  reason: z.enum(VERIFICATION_DECLINE_REASONS),
  message: z.string().min(1).max(500),
  notes: z.string().max(1000).optional(),
});
export type DeclineVerificationInput = z.infer<typeof declineVerificationSchema>;

export const createReportSchema = z.object({
  category: z.enum([
    'unsafe_driving',
    'harassment',
    'no_show',
    'payment_dispute',
    'vehicle_condition',
    'other',
  ]),
  description: z.string().min(1).max(2000),
  reportedUserId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const adminReportsQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
});
export type AdminReportsQuery = z.infer<typeof adminReportsQuerySchema>;

export const updateReportSchema = z.object({
  status: z.enum(['open', 'investigating', 'resolved', 'dismissed']),
  resolutionNotes: z.string().max(2000).optional(),
});
export type UpdateReportInput = z.infer<typeof updateReportSchema>;

export const analyticsEventsIngestSchema = z.object({
  events: z
    .array(
      z.object({
        eventName: z.string().min(1).max(64),
        searchId: z.string().uuid().nullable().optional(),
        originLabel: z.string().max(140).nullable().optional(),
        originLat: z.number().nullable().optional(),
        originLng: z.number().nullable().optional(),
        destinationLabel: z.string().max(140).nullable().optional(),
        destinationLat: z.number().nullable().optional(),
        destinationLng: z.number().nullable().optional(),
        desiredDepartureAt: z.string().datetime().nullable().optional(),
        seats: z.number().int().min(1).nullable().optional(),
        resultCount: z.number().int().min(0).nullable().optional(),
        matchTier: z.string().max(32).nullable().optional(),
        selectedRideId: z.string().uuid().nullable().optional(),
        durationMs: z.number().int().min(0).nullable().optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type AnalyticsEventsIngestInput = z.infer<typeof analyticsEventsIngestSchema>;

export const adminAnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
export type AdminAnalyticsQuery = z.infer<typeof adminAnalyticsQuerySchema>;
