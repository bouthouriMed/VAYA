import type { RecurringDetectionConfig } from './recurring-detection-config.types';

/**
 * The dismissed-pattern business rule (docs/roadmap/phase-11-recurring-rides.md):
 * "A dismissed pattern should not be re-suggested identically — either
 * suppress permanently or require materially stronger evidence (higher
 * trip count) before re-prompting." This module picks the second option.
 *
 * **Chosen mechanism, and why no new column was needed**: `confidenceScore`
 * on the existing `recurring_patterns` row is never cleared on dismissal —
 * it stays exactly as it was the moment the user dismissed it, a durable
 * "evidence level at dismissal" baseline for free. A later detection scan
 * recomputes a fresh `confidenceScore` from the user's current trip history
 * and only resurrects the row (dismissed → detected/suggested) if the new
 * score clears the old one by at least `dismissalRequiredConfidenceDelta`
 * — since confidenceScore is itself a function of trip count (and time
 * consistency), a materially higher score is, in practice, materially
 * stronger evidence, without tracking trip count separately. This also
 * naturally satisfies the "reduce, not eliminate, future re-prompting"
 * framing in docs/roadmap/phase-11-recurring-rides.md's UX behavior
 * section — dismissal isn't permanent, it just raises the bar.
 */
export function shouldResuggestAfterDismissal(
  confidenceScoreAtDismissal: number,
  freshlyComputedConfidenceScore: number,
  config: Pick<RecurringDetectionConfig, 'dismissalRequiredConfidenceDelta'>,
): boolean {
  return (
    freshlyComputedConfidenceScore >=
    confidenceScoreAtDismissal + config.dismissalRequiredConfidenceDelta
  );
}
