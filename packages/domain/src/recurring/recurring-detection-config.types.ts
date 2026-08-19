/**
 * Externalized, tunable thresholds for recurring-pattern detection
 * (Phase 11 — docs/roadmap/phase-11-recurring-rides.md), mirroring the
 * `pricing_configs`-style pattern Phase 6 established: never a hardcoded
 * magic number in the detection algorithm itself, always a config object
 * threaded in from a DB-backed row (apps/api/src/modules/recurring/
 * recurring-config.service.ts) with a pure in-package fallback default
 * (`default-recurring-detection-config.ts`) if no row exists yet.
 */
export interface RecurringDetectionConfig {
  /** Minimum number of same-corridor trips within the lookback window
   *  before a cluster is written as a `detected` pattern at all — below
   *  this, it's not a pattern yet, just one or two coincidental trips. */
  minTripCount: number;
  /** Trip count at which the trip-count component of confidenceScore
   *  reaches its own maximum (1.0) — more trips beyond this still count,
   *  they just stop adding further confidence from this component alone. */
  fullConfidenceTripCount: number;
  /** How far back (in days) the detection scan looks at ride/booking
   *  history when clustering a user's trips into corridors. */
  lookbackDays: number;
  /** Two trips are considered "the same corridor" when both their origins
   *  and destinations fall within this radius of each other. */
  corridorRadiusMeters: number;
  /** How similar a cluster's departure times must be (max spread, in
   *  minutes, between the earliest and latest observed departure time of
   *  day) to count as a consistent "time window" — the wider the observed
   *  spread relative to this, the lower the confidence score. */
  timeWindowMinutes: number;
  /** confidenceScore cutoff at/above which a pattern is promoted from
   *  `detected` to `suggested` (i.e. worth actually prompting the user
   *  about) — below this, the pattern is written but stays silently
   *  `detected`, accumulating more evidence on future scans. */
  suggestedConfidenceThreshold: number;
  /** How much *higher* a freshly re-detected pattern's confidenceScore
   *  must be than it was at the moment of dismissal before it's allowed to
   *  be resurfaced (packages/domain/src/recurring/should-resuggest-after-dismissal.ts)
   *  — the "materially stronger evidence" business rule
   *  (docs/roadmap/phase-11-recurring-rides.md), not eliminating
   *  re-suggestion outright. */
  dismissalRequiredConfidenceDelta: number;
}
