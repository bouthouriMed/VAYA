import type { RecurringDetectionConfig } from './recurring-detection-config.types';

/**
 * First-cut default detection thresholds, used when no active
 * `recurring_detection_configs` row exists (mirrors
 * `packages/domain/src/pricing/default-pricing-config.ts`'s fallback role
 * for `pricing_configs`). Reasoning for each value:
 *
 * - `minTripCount: 3` — matches the phase doc's own example prompt copy
 *   verbatim ("Vous avez pris cet itinéraire 3 fois ce mois-ci") — three
 *   occurrences is the minimum that reads as "a pattern," not coincidence.
 * - `fullConfidenceTripCount: 6` — roughly one round-trip-equivalent a week
 *   for three weeks; beyond this more repetitions don't need to keep
 *   pushing the trip-count component of confidence higher.
 * - `lookbackDays: 60` — long enough to catch a real weekly commute even
 *   through a quiet fortnight (holidays, a week without matching rides),
 *   short enough that a corridor someone stopped using a season ago isn't
 *   still treated as "current."
 * - `corridorRadiusMeters: 1200` — the same order of magnitude as
 *   `matching.service.ts`'s existing pickup-radius constants (2000m tight /
 *   8000m wide); tighter than the tight search radius since this is
 *   asking "is this genuinely the same trip," not "would a passenger
 *   accept this as a nearby alternative."
 * - `timeWindowMinutes: 60` — a commute that drifts within about an hour
 *   day to day (leaving a bit earlier/later) is still recognizably "the
 *   same" trip; beyond that it reads as two different trips that happen to
 *   share a route.
 * - `suggestedConfidenceThreshold: 0.6` — the point past which the
 *   trip-count and time-consistency evidence together outweigh noise; see
 *   detect-recurring-patterns.ts's confidenceScore formula.
 * - `dismissalRequiredConfidenceDelta: 0.15` — a re-suggestion after
 *   dismissal must be meaningfully more confident than it was when
 *   dismissed, not just marginally different from one extra trip's worth
 *   of noise.
 *
 * All values are first-cut and explicitly pending tuning against real
 * usage data, the same posture Phase 6's `DEFAULT_PRICING_CONFIG` and
 * Phase 10's cancellation-policy weights already document — see
 * docs/roadmap/README.md's Open Decisions.
 */
export const DEFAULT_RECURRING_DETECTION_CONFIG: RecurringDetectionConfig = {
  minTripCount: 3,
  fullConfidenceTripCount: 6,
  lookbackDays: 60,
  corridorRadiusMeters: 1200,
  timeWindowMinutes: 60,
  suggestedConfidenceThreshold: 0.6,
  dismissalRequiredConfidenceDelta: 0.15,
};
