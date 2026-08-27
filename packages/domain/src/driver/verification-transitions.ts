import type { VerificationStatus } from './driver-profile.types';

// Admin verification workflow (docs/domain/verification-workflow.md).
// `approved`/`rejected` are terminal by design: a rejected submission's only
// way forward is a fresh onboarding attempt (not modeled as a transition —
// out of this workflow's scope), while `resubmission_required` is the
// explicit "fixable, please try again" outcome that loops back to `pending`
// once the driver re-submits documents.
export const VERIFICATION_STATUS_TRANSITIONS: Record<
  VerificationStatus,
  readonly VerificationStatus[]
> = {
  pending: ['under_review', 'approved', 'rejected', 'resubmission_required'],
  under_review: ['approved', 'rejected', 'resubmission_required'],
  resubmission_required: ['pending'],
  approved: [],
  rejected: [],
};

export function canTransitionVerificationStatus(
  from: VerificationStatus,
  to: VerificationStatus,
): boolean {
  return VERIFICATION_STATUS_TRANSITIONS[from].includes(to);
}
