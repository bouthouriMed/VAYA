import type { ExistingPassengerImpactThresholds } from './existing-passenger-impact-thresholds';

/**
 * Existing Passengers Have Soft Protection (spec §27, matrix M-083/M-084,
 * EDGE-052, INV-09). A new request must be evaluated against every existing
 * confirmed/onboard passenger on the ride — their ETA is a soft estimate, not
 * an immutable contractual timestamp, so a small added delay is acceptable
 * and a substantial one is not, judged relative to each passenger's own
 * remaining trip length (ratio-relative — see
 * `existing-passenger-impact-thresholds.ts`).
 *
 * Pure function: no I/O, no DB access. The caller (matching/booking service)
 * is responsible for computing each existing passenger's `tripDurationMinutes`
 * (their own remaining scheduled duration) and `addedDelayMinutes` (the extra
 * time the new request would cost them) from real route/booking data before
 * calling this.
 */
export interface ExistingPassengerImpactInput {
  passengerId: string;
  /** The existing passenger's own remaining trip duration, in minutes. */
  tripDurationMinutes: number;
  /** The additional delay the new request would add to this passenger's
   *  journey, in minutes. */
  addedDelayMinutes: number;
}

export interface ExistingPassengerImpactViolation {
  passengerId: string;
  addedDelayMinutes: number;
  /** addedDelayMinutes / tripDurationMinutes — the ratio that was compared
   *  against `thresholds.maxDelayRatio`. */
  delayRatio: number;
}

export interface ExistingPassengerImpactResult {
  /** INV-09: false if even one existing passenger is impacted beyond
   *  acceptable limits — never true while `violations` is non-empty. */
  acceptable: boolean;
  violations: ExistingPassengerImpactViolation[];
}

export function evaluateExistingPassengerImpact(
  existingPassengers: ExistingPassengerImpactInput[],
  thresholds: ExistingPassengerImpactThresholds,
): ExistingPassengerImpactResult {
  const violations: ExistingPassengerImpactViolation[] = [];

  for (const passenger of existingPassengers) {
    const delayRatio =
      passenger.tripDurationMinutes > 0
        ? passenger.addedDelayMinutes / passenger.tripDurationMinutes
        : Infinity;

    const exceedsRatio = delayRatio > thresholds.maxDelayRatio;
    const exceedsAbsolute = passenger.addedDelayMinutes > thresholds.maxAbsoluteDelayMinutes;

    if (exceedsRatio || exceedsAbsolute) {
      violations.push({
        passengerId: passenger.passengerId,
        addedDelayMinutes: passenger.addedDelayMinutes,
        delayRatio,
      });
    }
  }

  return { acceptable: violations.length === 0, violations };
}
