import type { TimestampedEntity, UUID } from '../shared/base.types.js';

export const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface DriverProfile extends TimestampedEntity {
  userId: UUID;
  verificationStatus: VerificationStatus;
  bio: string | null;
  ratingAvg: number;
  tripCount: number;
  punctualityScore: number;
  reliabilityScore: number;
  approvedAt: Date | null;
}
