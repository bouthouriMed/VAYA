/**
 * Starting a Trip (spec §35 — matrix M-099/M-100). A driver can explicitly
 * press "Start trip", but VAYA must not depend exclusively on this: if the
 * driver ignores the CTA and system evidence strongly indicates the trip has
 * started, VAYA should transition automatically. Evidence can include: time,
 * origin proximity, sustained movement, route progress, expected journey
 * timing.
 *
 * Interpretation (documented ambiguity-log entry A-6, docs/tdd_journey_test_matrix.md
 * — the spec lists candidate evidence but no explicit combination rule):
 * `timeReached` is treated as a REQUIRED anchor signal — a driver's origin
 * proximity + movement hours before the scheduled departure is not evidence
 * the *scheduled trip* began (that's indistinguishable from an unrelated
 * errand) — and at least one further corroborating signal is required on top
 * of it, mirroring `evaluateExistingPassengerImpact`'s
 * one-strong-signal-is-not-enough shape used elsewhere in this suite.
 *
 * Pure function: no I/O. The caller (trip lifecycle service) is responsible
 * for computing each boolean signal from real time/GPS/route data.
 */
export interface AutoStartSignals {
  /** The scheduled departure time has been reached (or passed). */
  timeReached: boolean;
  /** The driver's current position is near the ride's origin. */
  originProximity: boolean;
  /** The driver has shown sustained (not momentary) movement. */
  sustainedMovement: boolean;
  /** The driver's position/heading is consistent with progressing along the
   *  ride's planned route. */
  routeProgress: boolean;
}

export interface AutoStartResult {
  shouldStart: boolean;
  /** How many of the four signals are true — reported for observability,
   *  not itself the decision rule. */
  corroboratingCount: number;
}

export function evaluateAutoStart(signals: AutoStartSignals): AutoStartResult {
  const corroboratingCount = [
    signals.timeReached,
    signals.originProximity,
    signals.sustainedMovement,
    signals.routeProgress,
  ].filter(Boolean).length;

  const hasCorroboration = signals.originProximity || signals.sustainedMovement || signals.routeProgress;
  const shouldStart = signals.timeReached && hasCorroboration;

  return { shouldStart, corroboratingCount };
}
