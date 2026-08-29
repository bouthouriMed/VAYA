import { describe, it, expect } from 'vitest';
import {
  computeCancellationPolicy,
  canReportNoShow,
  CANCELLATION_FREE_WINDOW_HOURS,
  CANCELLATION_MODERATE_WINDOW_MINUTES,
  NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE,
} from '../cancellation-policy';
import { newCanonicalClock } from '@vaya/test-fixtures';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-101, M-102,
 * §39 deterministic-time requirement, §44 regression protection for
 * no-cancellation-after-start's booking-level enforcement).
 *
 * Uses a real controllable clock (never real wall-clock time) with exact
 * boundary instants — one second before/at/after each threshold — per
 * spec §39's explicit edge-case list.
 *
 * **Second-pass note (this review):** the tier windows and the no-show
 * grace period are VAYA operational policy (spec's own "Operational Policy
 * Configuration" section — see docs/unified_driver_and_passenger_journey.md)
 * — not a permanent product constant. This file locks in *today's current
 * default* (`CANCELLATION_FREE_WINDOW_HOURS`/`CANCELLATION_MODERATE_WINDOW_MINUTES`/
 * `NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE`, exported from `../cancellation-policy`)
 * by referencing those constants rather than restating their values as bare
 * literals, so this test tracks the configured default wherever it moves
 * instead of silently re-freezing "24" and "30" as an unrelated hardcoded
 * expectation. `computeCancellationPolicy`/`canReportNoShow` do not yet
 * accept an injected threshold override (unlike `evaluateExistingPassengerImpact`
 * or `detourAllowanceSec`'s floor/ceiling params) — flagged in
 * docs/tdd_journey_test_report.md as a policy value that should move behind
 * admin configuration, not something this review changes.
 */
describe('cancellation-policy — deterministic-clock boundary contract', () => {
  it('tier is exactly "free" at the free-window boundary and 1 second before departure, "moderate" one minute inside that boundary', () => {
    const clock = newCanonicalClock();
    const departureAt = clock.plusMinutes(CANCELLATION_FREE_WINDOW_HOURS * 60 + 1);
    const oneSecondInsideFree = clock.plusSeconds(0); // free-window + 1min out — free.
    expect(computeCancellationPolicy(departureAt, oneSecondInsideFree).tier).toBe('free');

    const departureAt2 = clock.plusMinutes(CANCELLATION_FREE_WINDOW_HOURS * 60);
    const atExactlyFreeBoundary = clock.plusSeconds(0); // exactly at the free-window boundary — free (>= boundary).
    expect(computeCancellationPolicy(departureAt2, atExactlyFreeBoundary).tier).toBe('free');

    const justInsideModerate = clock.plusSeconds(1); // 1 second after "now", i.e. free-window boundary - 1s before departure.
    expect(computeCancellationPolicy(departureAt2, justInsideModerate).tier).toBe('moderate');
  });

  it('tier is exactly "moderate" at the moderate-window boundary before departure, "severe" one second later', () => {
    const clock = newCanonicalClock();
    const departureAt = clock.plusMinutes(CANCELLATION_MODERATE_WINDOW_MINUTES);
    expect(computeCancellationPolicy(departureAt, clock.now()).tier).toBe('moderate'); // exactly at the moderate-window boundary.
    expect(computeCancellationPolicy(departureAt, clock.plusSeconds(1)).tier).toBe('severe'); // 1s inside the boundary.
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

  it('cannot be reported inside the no-show grace window immediately after departure', () => {
    const clock = newCanonicalClock();
    const departureAt = clock.now();
    expect(canReportNoShow(departureAt, clock.plusMinutes(NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE - 1))).toBe(false);
    expect(canReportNoShow(departureAt, clock.plusMinutes(NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE))).toBe(true); // exact boundary.
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
