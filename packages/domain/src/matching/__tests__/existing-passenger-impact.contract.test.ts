import { describe, it, expect } from 'vitest';
import { evaluateExistingPassengerImpact } from '../existing-passenger-impact';
import { DEFAULT_EXISTING_PASSENGER_IMPACT_THRESHOLDS } from '../existing-passenger-impact-thresholds';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-083, M-084,
 * EDGE-052, INV-09) — spec §27 "Existing Passengers Have Soft Protection":
 *
 *   "A new request must be evaluated against all existing confirmed/onboard
 *    passengers... their ETA is an estimate, not an immutable contractual
 *    timestamp. Small delays are acceptable (+15 minutes on a 3-hour trip
 *    may be acceptable). A substantial delay is not. VAYA therefore uses
 *    internal configurable thresholds."
 *
 * This capability is confirmed 100% MISSING today (matrix M-083: "grep
 * confirms zero `existingPassenger`/`etaImpact` references" anywhere in
 * apps/api/src/modules/matching or bookings). Per the TDD-gate contract
 * (.claude/continue-tdd.md §2/§8 — "do not start production implementation
 * merely because some tests exist"), this file specifies the intended pure
 * contract ONLY; `existing-passenger-impact.ts` and
 * `existing-passenger-impact-thresholds.ts` are intentionally NOT yet
 * implemented, so this whole file is expected to fail to resolve/compile —
 * a deliberate RED state, tracked as Category B ("missing required
 * behavior") in docs/tdd_journey_test_report.md, not a test-infra bug.
 *
 * Design mirrors two already-shipped precedents so the eventual
 * implementation has no invention left to do:
 *  - `default-pricing-config.ts` / `computeSuggestedPrice`: a pure function
 *    over caller-supplied numbers, config injected, zero I/O.
 *  - `matching-thresholds.ts`'s `MAX_DETOUR_RATIO`/`detourAllowanceSec`: a
 *    ratio-of-baseline-duration bound with an absolute floor/ceiling, rather
 *    than one fixed-minutes number for every trip length — the same shape
 *    solves this spec's own worked example (+15min acceptable on a 3h trip
 *    is a ~8.3% ratio, not a magic "15").
 *
 * Per ambiguity log A-2 (docs/tdd_journey_test_matrix.md): the spec gives
 * one example and no general curve. This suite asserts the QUALITATIVE
 * invariant (small ratio-relative delay acceptable, large one rejected,
 * evaluated independently per existing passenger, admin-configurable) using
 * the spec's own example as the boundary-adjacent case — never a specific
 * formula beyond that shape.
 */

const thresholds = DEFAULT_EXISTING_PASSENGER_IMPACT_THRESHOLDS;

describe('evaluateExistingPassengerImpact — soft protection for existing passengers (M-083/084, EDGE-052, INV-09)', () => {
  it("M-084/spec's own worked example: +15min added delay on a 3h (180min) existing trip is acceptable", () => {
    const result = evaluateExistingPassengerImpact(
      [{ passengerId: 'passenger-b', tripDurationMinutes: 180, addedDelayMinutes: 15 }],
      thresholds,
    );
    expect(result.acceptable).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('M-084: a substantial delay on the same 3h trip (e.g. +60min) is rejected', () => {
    const result = evaluateExistingPassengerImpact(
      [{ passengerId: 'passenger-b', tripDurationMinutes: 180, addedDelayMinutes: 60 }],
      thresholds,
    );
    expect(result.acceptable).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({ passengerId: 'passenger-b' }),
    ]);
  });

  it('M-083/EDGE-052: a new request is checked against EVERY existing passenger independently — one violator blocks the request even if others are fine', () => {
    const result = evaluateExistingPassengerImpact(
      [
        { passengerId: 'passenger-b', tripDurationMinutes: 180, addedDelayMinutes: 10 }, // fine
        { passengerId: 'passenger-c', tripDurationMinutes: 40, addedDelayMinutes: 30 }, // way over ratio for a short remaining trip
      ],
      thresholds,
    );
    expect(result.acceptable).toBe(false);
    expect(result.violations.map((v) => v.passengerId)).toEqual(['passenger-c']);
  });

  it('M-083: an empty existing-passenger list is trivially acceptable (nothing to protect)', () => {
    const result = evaluateExistingPassengerImpact([], thresholds);
    expect(result.acceptable).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('ratio-relative, not a flat-minutes cap: the same +15min is acceptable on a 3h trip but rejected on a very short remaining 20min trip', () => {
    const longTrip = evaluateExistingPassengerImpact(
      [{ passengerId: 'p', tripDurationMinutes: 180, addedDelayMinutes: 15 }],
      thresholds,
    );
    const shortTrip = evaluateExistingPassengerImpact(
      [{ passengerId: 'p', tripDurationMinutes: 20, addedDelayMinutes: 15 }],
      thresholds,
    );
    expect(longTrip.acceptable).toBe(true);
    expect(shortTrip.acceptable).toBe(false);
  });

  it('M-085/§28: thresholds are injected config, not hardcoded — a caller-supplied looser threshold changes the outcome', () => {
    const looseThresholds = { ...thresholds, maxDelayRatio: 0.9, maxAbsoluteDelayMinutes: 999 };
    const result = evaluateExistingPassengerImpact(
      [{ passengerId: 'p', tripDurationMinutes: 180, addedDelayMinutes: 60 }],
      looseThresholds,
    );
    expect(result.acceptable).toBe(true);
  });

  it('INV-09 (hard invariant): a request whose impact is unacceptable for even one existing passenger must never be reported as acceptable', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      passengerId: `p${i}`,
      tripDurationMinutes: 180,
      addedDelayMinutes: i === 3 ? 90 : 5, // one severe outlier among several fine ones
    }));
    const result = evaluateExistingPassengerImpact(many, thresholds);
    expect(result.acceptable).toBe(false);
    expect(result.violations.map((v) => v.passengerId)).toContain('p3');
  });
});
