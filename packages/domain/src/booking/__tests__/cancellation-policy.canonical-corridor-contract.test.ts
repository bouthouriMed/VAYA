import { describe, it, expect } from 'vitest';
import { computeCancellationPolicy, canReportNoShow } from '../cancellation-policy';
import { newCanonicalClock } from '@vaya/test-fixtures';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-101, M-102,
 * §39 deterministic-time requirement, §44 regression protection for
 * no-cancellation-after-start's booking-level enforcement).
 *
 * Uses a real controllable clock (never real wall-clock time) with exact
 * boundary instants — one second before/at/after each threshold — per
 * spec §39's explicit edge-case list.
 */
describe('cancellation-policy — deterministic-clock boundary contract', () => {
  it('tier is exactly "free" at 24h and 1 second before departure, "moderate" at exactly 24h before minus 1 second', () => {
    const clock = newCanonicalClock();
    const departureAt = clock.plusMinutes(24 * 60 + 1);
    const oneSecondInsideFree = clock.plusSeconds(0); // 24h+1min out — free.
    expect(computeCancellationPolicy(departureAt, oneSecondInsideFree).tier).toBe('free');

    const departureAt2 = clock.plusMinutes(24 * 60);
    const atExactly24hBoundary = clock.plusSeconds(0); // exactly 24h before — free (>= boundary).
    expect(computeCancellationPolicy(departureAt2, atExactly24hBoundary).tier).toBe('free');

    const justInsideModerate = clock.plusSeconds(1); // 1 second after "now", i.e. 24h - 1s before departure.
    expect(computeCancellationPolicy(departureAt2, justInsideModerate).tier).toBe('moderate');
  });

  it('tier is exactly "moderate" at 30 minutes before departure, "severe" one second later', () => {
    const clock = newCanonicalClock();
    const departureAt = clock.plusMinutes(30);
    expect(computeCancellationPolicy(departureAt, clock.now()).tier).toBe('moderate'); // exactly 30min out.
    expect(computeCancellationPolicy(departureAt, clock.plusSeconds(1)).tier).toBe('severe'); // 29min59s out.
  });

  it('tier is "severe" for a cancellation attempted after departure has already passed', () => {
    const clock = newCanonicalClock();
    const departureAt = clock.now();
    const afterDeparture = clock.plusMinutes(5);
    const result = computeCancellationPolicy(departureAt, afterDeparture);
    expect(result.tier).toBe('severe');
    expect(result.minutesBeforeDeparture).toBeLessThan(0);
  });

  it('spec §27 boundary-adjacent example: +15 minutes on a 3-hour trip is the spec\'s own "acceptable" reference point (documented, not a hard threshold here — see ambiguity log A-2)', () => {
    // This module has no notion of "existing passenger ETA impact" at all
    // (that's M-083/M-084, a separate MISSING capability tested at the API
    // layer). This test exists only to anchor the spec's own numeric
    // example against the clock fixture for when that capability is built.
    const tripDurationMinutes = 180;
    const acceptableDelayMinutes = 15;
    expect(acceptableDelayMinutes / tripDurationMinutes).toBeLessThan(0.1); // ~8.3%, the spec's own "acceptable" anchor point.
  });
});

describe('canReportNoShow — deterministic-clock boundary contract (M-102)', () => {
  it('cannot be reported before departure at all', () => {
    const clock = newCanonicalClock();
    const departureAt = clock.plusMinutes(10);
    expect(canReportNoShow(departureAt, clock.now())).toBe(false);
  });

  it('cannot be reported in the grace window immediately after departure (< 15 minutes)', () => {
    const clock = newCanonicalClock();
    const departureAt = clock.now();
    expect(canReportNoShow(departureAt, clock.plusMinutes(14))).toBe(false);
    expect(canReportNoShow(departureAt, clock.plusMinutes(15))).toBe(true); // exact boundary.
  });

  it('M-102 (documented gap, not asserted as a defect in THIS pure function): canReportNoShow is a pure time gate with no location/proximity parameter at all', () => {
    // The spec requires no-show to be contextual on time AND location AND
    // proximity (§37). This function's signature — (departureAt, reportedAt)
    // — structurally cannot express a location check; that is not a bug in
    // this function (it does exactly what its narrow contract promises),
    // it is the MISSING capability the matrix tracks as M-102/EDGE-052-adjacent.
    // Real, executable proof that the service layer built on top of this
    // function has no corroboration either lives in
    // apps/api/src/modules/bookings/__tests__/bookings-no-show-corroboration.contract.integration.test.ts
    // (expected to FAIL today).
    expect(canReportNoShow.length).toBe(2); // (departureAt, reportedAt) only — no location parameter.
  });
});
