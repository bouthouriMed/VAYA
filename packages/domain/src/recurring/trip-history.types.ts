/**
 * One past occurrence of a trip for a single user, in a single role
 * (driver or rider) — the input `detectRecurringPatterns` clusters. Built
 * by the caller (apps/api/src/modules/recurring/recurring.service.ts) from
 * either that user's own published `rides` (driver role) or their
 * accepted/completed `bookings` joined to their ride (rider role); this
 * module has no opinion on which — it only ever sees a role-homogeneous
 * list for one user at a time.
 */
export interface TripHistoryRecord {
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  departureAt: Date;
}

/**
 * One corridor cluster `detectRecurringPatterns` found in a user's trip
 * history, ready to be written as (or merged into) a `recurring_patterns`
 * row. Not yet a DB row — the caller decides insert vs. update vs. suppress
 * (existing `enabled`/`dismissed` handling) in
 * apps/api/src/modules/recurring/recurring.service.ts.
 */
export interface DetectedRecurringPattern {
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  /** Bitmask, Monday = bit 0 ... Sunday = bit 6 — matches
   *  docs/domain/model.md's `recurring_patterns.daysOfWeekMask` convention. */
  daysOfWeekMask: number;
  /** "HH:MM", the earliest observed departure time-of-day in the cluster. */
  timeWindowStart: string;
  /** "HH:MM", the latest observed departure time-of-day in the cluster. */
  timeWindowEnd: string;
  /** 0-1, see detect-recurring-patterns.ts's doc comment for the formula. */
  confidenceScore: number;
  tripCount: number;
}
