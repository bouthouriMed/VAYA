import { describe, it, expect } from 'vitest';
import { evaluateAutoStart } from '../auto-start-inference';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-099, M-100) —
 * spec §35 "Starting a Trip":
 *
 *   "A driver can explicitly press Start trip. But VAYA must not depend
 *    exclusively on this. If the driver ignores the CTA and system evidence
 *    strongly indicates the trip has started, VAYA should be able to
 *    transition automatically. Evidence can include: time, origin
 *    proximity, sustained movement, route progress, expected journey
 *    timing."
 *
 * Confirmed 100% missing today: `computeAutoTripStatusTransition`
 * (packages/domain/src/trip/tracking-transitions.ts) has no case at all for
 * `scheduled` — the trip only ever leaves `scheduled` via a manual "Start
 * trip" tap. This file specifies the intended sibling pure function,
 * `evaluateAutoStart`, following that same file's established shape
 * (pure signals in, decision out, no I/O) — intentionally NOT implemented
 * yet, so this file is expected RED (Category B) per the TDD-gate contract.
 *
 * Per ambiguity log A-3 (docs/tdd_journey_test_matrix.md): the spec lists
 * candidate evidence but no combination rule. This suite documents one
 * concrete, defensible interpretation as a NEW ambiguity-log entry (A-6,
 * see docs/tdd_journey_test_matrix.md) rather than silently assuming it is
 * "the" answer: `timeReached` is treated as a required anchor signal (a
 * driver's origin-proximity + movement hours before the scheduled departure
 * must never auto-start a trip — that's indistinguishable from an unrelated
 * errand), and at least one further corroborating signal is required on top
 * of it — mirroring `evaluateExistingPassengerImpact`'s
 * one-strong-signal-is-not-enough shape used elsewhere in this suite.
 */

describe('evaluateAutoStart — automatic scheduled -> started transition (M-099, M-100)', () => {
  it('M-100: time reached alone, with no other corroborating evidence, is NOT sufficient', () => {
    const result = evaluateAutoStart({
      timeReached: true,
      originProximity: false,
      sustainedMovement: false,
      routeProgress: false,
    });
    expect(result.shouldStart).toBe(false);
  });

  it('M-099: time reached + sustained movement is sufficient', () => {
    const result = evaluateAutoStart({
      timeReached: true,
      originProximity: false,
      sustainedMovement: true,
      routeProgress: false,
    });
    expect(result.shouldStart).toBe(true);
    expect(result.corroboratingCount).toBeGreaterThanOrEqual(2);
  });

  it('M-099: time reached + origin proximity (no movement yet) is sufficient', () => {
    const result = evaluateAutoStart({
      timeReached: true,
      originProximity: true,
      sustainedMovement: false,
      routeProgress: false,
    });
    expect(result.shouldStart).toBe(true);
  });

  it('A-6 (documented interpretation): origin proximity + movement + route progress WITHOUT time reached must not auto-start — a driver moving near the origin well before departure is not evidence the scheduled trip began', () => {
    const result = evaluateAutoStart({
      timeReached: false,
      originProximity: true,
      sustainedMovement: true,
      routeProgress: true,
    });
    expect(result.shouldStart).toBe(false);
  });

  it('all four signals present is sufficient and reports the full corroborating count', () => {
    const result = evaluateAutoStart({
      timeReached: true,
      originProximity: true,
      sustainedMovement: true,
      routeProgress: true,
    });
    expect(result.shouldStart).toBe(true);
    expect(result.corroboratingCount).toBe(4);
  });

  it('no signals at all never auto-starts', () => {
    const result = evaluateAutoStart({
      timeReached: false,
      originProximity: false,
      sustainedMovement: false,
      routeProgress: false,
    });
    expect(result.shouldStart).toBe(false);
    expect(result.corroboratingCount).toBe(0);
  });
});
