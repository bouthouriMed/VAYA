/**
 * Boarding Detection (spec §33, P7 "never expose false certainty" — matrix
 * M-096/M-097). Signals can include: driver location, passenger location,
 * proximity, sustained proximity, movement, route context, pickup timing,
 * both users' confirmation actions. A user's confirmation button is useful
 * but must not be mandatory ("must not be mandatory", not "must not work"),
 * and the system must be conservative when evidence is ambiguous.
 *
 * P7's literal sentence ("not from two GPS points briefly becoming close")
 * is encoded as a hard, non-negotiable gate: `sustainedProximityMet: false`
 * (proximity was only momentary) makes `shouldBoard` false no matter what
 * other GPS-derived signals are true — this is the exact failure mode P7
 * names by name, so it is a strict gate rather than one vote among several.
 *
 * An explicit confirmation tap (driver or passenger) is modeled as an
 * independent, always-sufficient path — categorically stronger evidence than
 * any inferred GPS signal, so it bypasses the sustained-proximity gate
 * entirely rather than being one more vote subject to it.
 *
 * Pure function: no I/O.
 */
export interface BoardingSignals {
  /** Driver/passenger proximity has been sustained, not merely momentary. */
  sustainedProximityMet: boolean;
  movement: boolean;
  routeContext: boolean;
  pickupTimingPlausible: boolean;
  driverConfirmed: boolean;
  passengerConfirmed: boolean;
}

export type BoardingReason = 'insufficient_evidence' | 'corroborated_signals' | 'explicit_confirmation';

export interface BoardingResult {
  shouldBoard: boolean;
  reason: BoardingReason;
}

export function evaluateBoarding(signals: BoardingSignals): BoardingResult {
  if (signals.driverConfirmed || signals.passengerConfirmed) {
    return { shouldBoard: true, reason: 'explicit_confirmation' };
  }

  // P7 hard gate: momentary proximity is never sufficient, regardless of
  // any other true signal.
  if (!signals.sustainedProximityMet) {
    return { shouldBoard: false, reason: 'insufficient_evidence' };
  }

  const hasCorroboration = signals.movement || signals.routeContext || signals.pickupTimingPlausible;
  if (!hasCorroboration) {
    // Conservative when ambiguous (M-097): sustained proximity alone,
    // with nothing else corroborating, is not enough.
    return { shouldBoard: false, reason: 'insufficient_evidence' };
  }

  return { shouldBoard: true, reason: 'corroborated_signals' };
}
