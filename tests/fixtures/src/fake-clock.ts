/**
 * Deterministic, controllable clock for time-sensitive contract tests
 * (docs/tdd_journey_test_matrix.md §39 — "all journey tests must use
 * deterministic time, do NOT depend on real wall-clock time").
 *
 * Pure in-process object — does not touch global Date/timers, so it is safe
 * to use alongside vitest's own fake timers or standalone. Tests that need
 * to control what a real service reads from `Date.now()` still need to pass
 * a value derived from this clock into that service's real parameters
 * (departureAt, etc.) rather than relying on global time mocking, since most
 * VAYA service functions take timestamps as data, not by reading the clock
 * themselves.
 */
export class FakeClock {
  private currentMs: number;

  constructor(startIso: string) {
    this.currentMs = new Date(startIso).getTime();
  }

  now(): Date {
    return new Date(this.currentMs);
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  advanceSeconds(seconds: number): Date {
    this.currentMs += seconds * 1000;
    return this.now();
  }

  advanceMinutes(minutes: number): Date {
    return this.advanceSeconds(minutes * 60);
  }

  advanceHours(hours: number): Date {
    return this.advanceMinutes(hours * 60);
  }

  set(iso: string): Date {
    this.currentMs = new Date(iso).getTime();
    return this.now();
  }

  plusMinutes(minutes: number): Date {
    return new Date(this.currentMs + minutes * 60_000);
  }

  plusSeconds(seconds: number): Date {
    return new Date(this.currentMs + seconds * 1000);
  }

  minusMinutes(minutes: number): Date {
    return this.plusMinutes(-minutes);
  }
}

/**
 * A fixed, realistic anchor used by every test that doesn't care about a
 * specific date — a Tuesday, clear of DST transitions in both the EU and any
 * other zone the suite might run under.
 */
export const CANONICAL_NOW_ISO = '2026-09-15T08:00:00.000Z';

export function newCanonicalClock(): FakeClock {
  return new FakeClock(CANONICAL_NOW_ISO);
}
