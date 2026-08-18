import type { TimestampedEntity, UUID } from '../shared/base.types';

export const VERIFICATION_DOCUMENT_TYPES = ['license', 'registration'] as const;
export type VerificationDocumentType = (typeof VERIFICATION_DOCUMENT_TYPES)[number];

export const VERIFICATION_DOCUMENT_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type VerificationDocumentStatus = (typeof VERIFICATION_DOCUMENT_STATUSES)[number];

export interface VerificationDocument extends TimestampedEntity {
  driverProfileId: UUID;
  type: VerificationDocumentType;
  fileUrl: string;
  status: VerificationDocumentStatus;
}
