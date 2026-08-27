import type { VerificationDeclineReason } from '../../state/api';

/**
 * Maps the 7 structured decline reasons an admin picks from (docs/domain/
 * verification-workflow.md) onto i18n keys — pure, no React, so it
 * unit-tests without mocks (same discipline as myRidesHelpers.ts). The
 * actual human-readable explanation always comes from the admin's own
 * required `verificationDeclineMessage` (never fabricated here); this is
 * only the structured reason's own short label, shown alongside it.
 */
const REASON_KEY: Record<VerificationDeclineReason, string> = {
  document_unclear: 'onboarding.verificationReasons.documentUnclear',
  expired: 'onboarding.verificationReasons.expired',
  information_mismatch: 'onboarding.verificationReasons.informationMismatch',
  missing_document: 'onboarding.verificationReasons.missingDocument',
  invalid_document: 'onboarding.verificationReasons.invalidDocument',
  additional_info_required: 'onboarding.verificationReasons.additionalInfoRequired',
  other: 'onboarding.verificationReasons.other',
};

export function verificationDeclineReasonKey(reason: VerificationDeclineReason): string {
  return REASON_KEY[reason];
}
