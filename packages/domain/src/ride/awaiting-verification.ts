import type { VerificationStatus } from '../driver/driver-profile.types';

// A driver who isn't approved yet can still build and "publish" a ride: it is
// saved as a `draft` flagged `publish_on_verification_at` and goes live the
// moment an admin approves them. Before this existed, a pending driver's ride
// was rejected outright and silently lost while the app told them it was
// saved.

/** Verification statuses whose ride may wait for approval — the driver is
 *  still in the review loop. `rejected` is terminal (a fresh onboarding is
 *  needed), so a ride saved then could never go live. */
const AWAITING_STATUSES: readonly VerificationStatus[] = [
  'pending',
  'under_review',
  'resubmission_required',
];

export function canRideAwaitVerification(status: VerificationStatus): boolean {
  return AWAITING_STATUSES.includes(status);
}

export type AwaitingRideOutcome = 'publish' | 'expire';

/** What happens to a waiting ride once its driver is approved: published if
 *  it still has a future departure, otherwise expired — publishing a ride
 *  whose departure already passed would show riders a trip nobody can take. */
export function resolveAwaitingRideOnApproval(departureAt: Date, now: Date): AwaitingRideOutcome {
  return departureAt.getTime() > now.getTime() ? 'publish' : 'expire';
}
