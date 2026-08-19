import type { RecurringPatternStatus } from './recurring-pattern.types';
import type { RecurringDetectionConfig } from './recurring-detection-config.types';

/**
 * User-facing status transitions for `recurring_patterns`
 * (docs/domain/model.md: `detected → suggested → enabled`, `dismissed` at
 * any point), mirroring `ride-status.ts`/`booking-status.ts`'s authoritative
 * transition-table pattern — consumed by
 * apps/api/src/modules/recurring/recurring.service.ts, never duplicated in
 * the API layer.
 *
 * `dismissed` has no outgoing edges here deliberately: resurrecting a
 * dismissed pattern is a *system* decision (the detection job finding
 * materially stronger evidence — see `shouldResuggestAfterDismissal` below)
 * , not a transition a raw user-facing PATCH request can ever request
 * directly.
 */
const RECURRING_PATTERN_STATUS_TRANSITIONS: Record<
  RecurringPatternStatus,
  readonly RecurringPatternStatus[]
> = {
  detected: ['suggested', 'enabled', 'dismissed'],
  suggested: ['enabled', 'dismissed'],
  enabled: ['dismissed'],
  dismissed: [],
};

export function canTransitionRecurringPatternStatus(
  from: RecurringPatternStatus,
  to: RecurringPatternStatus,
): boolean {
  return RECURRING_PATTERN_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Whether a freshly detected/refined pattern is merely `detected` (real,
 * but not yet confident enough to interrupt the user) or `suggested`
 * (confident enough to actually prompt) — the "what confidenceScore
 * warrants a suggested prompt" tunable threshold
 * (docs/roadmap/phase-11-recurring-rides.md's Business rules).
 */
export function computeRecurringPatternStatus(
  confidenceScore: number,
  config: Pick<RecurringDetectionConfig, 'suggestedConfidenceThreshold'>,
): 'detected' | 'suggested' {
  return confidenceScore >= config.suggestedConfidenceThreshold ? 'suggested' : 'detected';
}
