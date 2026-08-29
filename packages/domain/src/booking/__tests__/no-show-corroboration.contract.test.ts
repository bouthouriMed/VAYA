import { describe, it, expect } from 'vitest';
import { evaluateNoShowReport, NO_SHOW_MAX_REPORTER_DISTANCE_METERS } from '../cancellation-policy';
import { NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE } from '../cancellation-policy';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-102) — spec §37
 * "No-Show":
 *
 *   "No-show should be contextual. A passenger sitting at home should not
 *    simply be able to report: Driver is a no-show. The action becomes
 *    relevant around: scheduled pickup time, pickup location,
 *    driver/passenger physical proximity, expected arrival window."
 *
 * `canReportNoShow` (packages/domain/src/booking/cancellation-policy.ts,
 * already shipped, already tested/passing) enforces the TIME half of this
 * rule only. The matrix (M-102) confirms this is a real, documented gap:
 * "time gate only, zero location signal despite data availability" — GPS
 * data exists (Phase 5-8's live tracking) but nothing in `reportNoShow`
 * (bookings.service.ts) reads it. This file specifies the intended
 * extension, `evaluateNoShowReport`, deliberately NOT implemented yet (RED,
 * Category B) — added as a NEW export alongside the existing, unmodified
 * `canReportNoShow` (never weaken an already-passing test to make room for
 * a new one), reusing its real `NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE`
 * constant so the time gate can never silently drift between the two.
 *
 * Per ambiguity log A-4: the spec doesn't define "sufficiently strong
 * evidence" precisely. This suite asserts the qualitative property (a
 * reporter physically nowhere near the meeting point is not credible
 * evidence of a no-show; the same reporter must be able to report a
 * genuine no-show once at the actual location) and treats missing location
 * data as a graceful degradation to the existing time-only rule — a report
 * from a passenger whose phone has no GPS fix must not become permanently
 * unreportable, since `canReportNoShow`'s current time-only behavior is
 * itself a real, valid path today and must keep working unchanged.
 */

describe('evaluateNoShowReport — time + location corroboration for no-show reports (M-102)', () => {
  const departureAt = new Date('2026-09-15T10:00:00.000Z');

  it('time not yet elapsed is rejected regardless of location (unchanged from canReportNoShow)', () => {
    const tooEarly = new Date(departureAt.getTime() + (NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE - 1) * 60_000);
    const result = evaluateNoShowReport(departureAt, tooEarly, { reporterDistanceMetersFromMeetingPoint: 50 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('time_not_elapsed');
  });

  it('time elapsed + no location data available degrades gracefully to allowed (matches existing time-only behavior, never regresses it)', () => {
    const reportedAt = new Date(departureAt.getTime() + (NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE + 5) * 60_000);
    const result = evaluateNoShowReport(departureAt, reportedAt, { reporterDistanceMetersFromMeetingPoint: null });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ok');
  });

  it('§37: time elapsed but the reporter is nowhere near the meeting point ("a passenger sitting at home") is rejected', () => {
    const reportedAt = new Date(departureAt.getTime() + (NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE + 5) * 60_000);
    const result = evaluateNoShowReport(departureAt, reportedAt, {
      reporterDistanceMetersFromMeetingPoint: NO_SHOW_MAX_REPORTER_DISTANCE_METERS + 1000,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('reporter_too_far');
  });

  it('time elapsed + reporter genuinely at the meeting point is allowed', () => {
    const reportedAt = new Date(departureAt.getTime() + (NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE + 5) * 60_000);
    const result = evaluateNoShowReport(departureAt, reportedAt, { reporterDistanceMetersFromMeetingPoint: 20 });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ok');
  });

  it('boundary: exactly at the max reporter distance is still allowed (threshold is inclusive)', () => {
    const reportedAt = new Date(departureAt.getTime() + (NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE + 5) * 60_000);
    const result = evaluateNoShowReport(departureAt, reportedAt, {
      reporterDistanceMetersFromMeetingPoint: NO_SHOW_MAX_REPORTER_DISTANCE_METERS,
    });
    expect(result.allowed).toBe(true);
  });
});
