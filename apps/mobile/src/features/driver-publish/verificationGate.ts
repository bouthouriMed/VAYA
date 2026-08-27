import type { VerificationStatus } from '../../state/api';

/**
 * Gate for the review screen's "Publish ride" action (stitch/verification's
 * publish-verification-requirement-prompt.html): a ride only actually
 * publishes once the driver's profile is verified.
 *
 * Historical note, now corrected: this used to say `createOnboarding`
 * synchronously auto-approved every profile (a "locked product decision"),
 * so this function in practice only ever returned `false` for a profile
 * that hadn't been created yet. That decision was reversed for the live-
 * tracking/admin-platform initiative (docs/domain/verification-workflow.md):
 * a real admin review queue now exists, `createOnboarding` sets `pending`,
 * and a driver profile can genuinely sit in `pending`/`under_review`/
 * `resubmission_required`/`rejected` for real, possibly extended periods.
 * `publish.tsx`'s verification-requirement sheet branches on the full
 * status (see `startVerification`) rather than treating "not verified" as
 * one undifferentiated case — this gate itself stays a simple boolean,
 * since "can this ride publish right now" only ever has one right answer.
 */
export function isVerifiedDriver(
  driverProfile: { verificationStatus: VerificationStatus } | null | undefined,
): boolean {
  return driverProfile?.verificationStatus === 'approved';
}
