import type { TimestampedEntity, UUID } from '../shared/base.types';

export const VERIFICATION_STATUSES = [
  'pending',
  'under_review',
  'approved',
  'rejected',
  'resubmission_required',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_DECLINE_REASONS = [
  'document_unclear',
  'expired',
  'information_mismatch',
  'missing_document',
  'invalid_document',
  'additional_info_required',
  'other',
] as const;
export type VerificationDeclineReason = (typeof VERIFICATION_DECLINE_REASONS)[number];

export interface DriverProfile extends TimestampedEntity {
  userId: UUID;
  verificationStatus: VerificationStatus;
  bio: string | null;
  ratingAvg: number;
  tripCount: number;
  punctualityScore: number;
  reliabilityScore: number;
  approvedAt: Date | null;
  verificationDeclineReason: VerificationDeclineReason | null;
  verificationDeclineMessage: string | null;
  verificationAttempt: number;
}
