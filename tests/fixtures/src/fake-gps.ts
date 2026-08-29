/**
 * Deterministic GPS-fix fixtures for the tracking/lifecycle contract suite
 * (docs/tdd_journey_test_matrix.md §40 GPS edge cases). Every fixture is a
 * plain, explicit fix — no randomness — so a test asserting "stale GPS must
 * degrade gracefully" is asserting against a specific, reproducible input.
 */
import type { RoutePoint } from './canonical-corridor.js';

export interface GpsFix {
  readonly lat: number;
  readonly lng: number;
  readonly accuracyMeters: number;
  /** ISO timestamp the fix was captured/reported at. */
  readonly recordedAtIso: string;
  readonly heading?: number;
  readonly speedMps?: number;
}

export function freshFix(point: RoutePoint, atIso: string, opts?: Partial<GpsFix>): GpsFix {
  return {
    lat: point.lat,
    lng: point.lng,
    accuracyMeters: 8,
    recordedAtIso: atIso,
    heading: 0,
    speedMps: 25,
    ...opts,
  };
}

/** A fix reported long enough ago that it should be treated as stale (>10min old relative to "now"). */
export function staleFix(point: RoutePoint, nowIso: string, staleMinutes = 20): GpsFix {
  const staleAt = new Date(new Date(nowIso).getTime() - staleMinutes * 60_000).toISOString();
  return freshFix(point, staleAt, { accuracyMeters: 12 });
}

/** A fix with degraded horizontal accuracy (e.g. indoor/urban canyon) — still present, just untrustworthy. */
export function lowAccuracyFix(point: RoutePoint, atIso: string): GpsFix {
  return freshFix(point, atIso, { accuracyMeters: 250 });
}

/** Simulates a GPS jump — a fix implausibly far from the previous one given elapsed time. */
export function jumpFix(fromPoint: RoutePoint, jumpKm: number, atIso: string): GpsFix {
  // ~0.009 degrees latitude per km — coarse but adequate for a synthetic jump fixture.
  const degreesPerKm = 0.009;
  return freshFix(
    { lat: fromPoint.lat + jumpKm * degreesPerKm, lng: fromPoint.lng },
    atIso,
    { accuracyMeters: 8 },
  );
}

/** No fix at all — represents "location permission denied" / "GPS unavailable". */
export const NO_FIX: null = null;
