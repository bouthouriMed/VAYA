import { describe, it, expect } from 'vitest';
import { evaluateBoarding } from '../boarding-inference';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-096, M-097) —
 * spec §33 "Boarding Detection" and P7 "Never expose false certainty":
 *
 *   "Signals can include: driver location, passenger location, proximity,
 *    sustained proximity, movement, route context, pickup timing, both
 *    users' confirmation actions. User buttons are useful confirmation but
 *    must not be mandatory. The system should be conservative when evidence
 *    is ambiguous." / "The system should not claim that a passenger is
 *    onboard merely because two GPS points briefly become close."
 *
 * Confirmed 100% missing today (matrix M-096): the `pickup -> active`
 * transition (packages/domain/src/trip/trip-status.ts) has no automatic
 * path at all in `computeAutoTripStatusTransition`
 * (tracking-transitions.ts) — boarding is driver-tap-only. This file
 * specifies the intended pure function `evaluateBoarding`, deliberately NOT
 * implemented yet (RED, Category B), following the same
 * signals-in/decision-out shape as `evaluateAutoStart`
 * (auto-start-inference.contract.test.ts) for consistency across this
 * session's new tests.
 *
 * P7's literal sentence ("not from two GPS points briefly becoming close")
 * is encoded as a hard, non-negotiable rule distinct from the general
 * corroboration-counting used elsewhere in this suite:
 * `sustainedProximityMet: false` (i.e. proximity was only momentary) must
 * make `shouldBoard` false NO MATTER what other signals are true — this is
 * the one signal this function treats as a strict gate rather than one vote
 * among several, because it's the exact failure mode P7 names by name.
 *
 * A user's explicit confirmation tap is modeled as an independent,
 * always-sufficient path ("useful confirmation but must not be mandatory"
 * — i.e. it must not be the ONLY path, not that it doesn't work at all)
 * rather than one more vote subject to the sustained-proximity gate, since
 * an explicit human confirmation is categorically stronger evidence than
 * any inferred GPS signal.
 */

describe('evaluateBoarding — automatic pickup -> active (boarded) transition (M-096, M-097)', () => {
  it('P7 (hard rule): momentary proximity alone, even with movement and route context also true, must NOT report boarding', () => {
    const result = evaluateBoarding({
      sustainedProximityMet: false,
      movement: true,
      routeContext: true,
      pickupTimingPlausible: true,
      driverConfirmed: false,
      passengerConfirmed: false,
    });
    expect(result.shouldBoard).toBe(false);
    expect(result.reason).toBe('insufficient_evidence');
  });

  it('M-096: sustained proximity + movement is sufficient', () => {
    const result = evaluateBoarding({
      sustainedProximityMet: true,
      movement: true,
      routeContext: false,
      pickupTimingPlausible: false,
      driverConfirmed: false,
      passengerConfirmed: false,
    });
    expect(result.shouldBoard).toBe(true);
    expect(result.reason).toBe('corroborated_signals');
  });

  it('M-097: sustained proximity alone, with nothing else corroborating, is NOT sufficient (conservative when ambiguous)', () => {
    const result = evaluateBoarding({
      sustainedProximityMet: true,
      movement: false,
      routeContext: false,
      pickupTimingPlausible: false,
      driverConfirmed: false,
      passengerConfirmed: false,
    });
    expect(result.shouldBoard).toBe(false);
    expect(result.reason).toBe('insufficient_evidence');
  });

  it("§33: either party's explicit confirmation is independently sufficient, even with zero GPS signal", () => {
    const driverTap = evaluateBoarding({
      sustainedProximityMet: false,
      movement: false,
      routeContext: false,
      pickupTimingPlausible: false,
      driverConfirmed: true,
      passengerConfirmed: false,
    });
    expect(driverTap.shouldBoard).toBe(true);
    expect(driverTap.reason).toBe('explicit_confirmation');

    const passengerTap = evaluateBoarding({
      sustainedProximityMet: false,
      movement: false,
      routeContext: false,
      pickupTimingPlausible: false,
      driverConfirmed: false,
      passengerConfirmed: true,
    });
    expect(passengerTap.shouldBoard).toBe(true);
    expect(passengerTap.reason).toBe('explicit_confirmation');
  });

  it('all signals false never reports boarding', () => {
    const result = evaluateBoarding({
      sustainedProximityMet: false,
      movement: false,
      routeContext: false,
      pickupTimingPlausible: false,
      driverConfirmed: false,
      passengerConfirmed: false,
    });
    expect(result.shouldBoard).toBe(false);
  });
});
