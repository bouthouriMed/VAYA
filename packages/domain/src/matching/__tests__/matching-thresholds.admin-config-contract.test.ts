import { describe, it, expect } from 'vitest';
import { getMatchingThresholds, detourAllowanceSec, MAX_DETOUR_RATIO } from '../matching-thresholds';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-085/M-086,
 * spec §28 "Admin Configuration") — spec requires maximum driver detour,
 * acceptable passenger ETA impact, pickup/dropoff walking thresholds,
 * route-deviation thresholds, and timing tolerance to be admin-configurable
 * "through the existing admin configuration system... extended rather than
 * duplicated" (the existing `pricing_configs`/`recurring_detection_configs`
 * DB-row-plus-pure-default-fallback pattern).
 *
 * M-085/M-085a fix (this pass): `detourAllowanceSec` now takes `maxRatio` as
 * its 4th, explicit, injected parameter — `MAX_DETOUR_RATIO` remains the
 * pure default used only when a caller has no admin override to pass (the
 * exact pattern this spec section requires, matching
 * `evaluateExistingPassengerImpact`'s already-compliant shape). The real
 * callers (`apps/api`'s `matching.service.ts`'s detour_match tier and
 * `bookings.service.ts`'s `computeDetourImpact`) resolve the actual value
 * from `getActiveOperationalConfig` first — proven end-to-end, not just at
 * this pure-function level, by
 * `apps/api/src/modules/operational-config/__tests__/operational-config.integration.test.ts`'s
 * own detour-ratio case (real Postgres, an admin override genuinely
 * changing accepted/rejected detour behavior).
 */
describe('matching-thresholds — admin-configurability, M-085/M-086', () => {
  it('PASS (M-085): detourAllowanceSec accepts an explicit maxRatio override, and it genuinely changes the computed allowance', () => {
    // Floor/ceiling pushed wide open (0 / MAX_SAFE_INTEGER) so this isolates
    // the ratio's own effect — the floor/ceiling clamp itself is a separate,
    // already-covered concern (matching-thresholds.test.ts).
    const baselineDurationSec = 3600; // 1h baseline.
    const withDefaultRatio = detourAllowanceSec(baselineDurationSec, 0, Number.MAX_SAFE_INTEGER);
    const withHalvedRatio = detourAllowanceSec(
      baselineDurationSec,
      0,
      Number.MAX_SAFE_INTEGER,
      MAX_DETOUR_RATIO / 2,
    );
    const withDoubledRatio = detourAllowanceSec(
      baselineDurationSec,
      0,
      Number.MAX_SAFE_INTEGER,
      MAX_DETOUR_RATIO * 2,
    );
    expect(withHalvedRatio).toBeLessThan(withDefaultRatio);
    expect(withDoubledRatio).toBeGreaterThan(withDefaultRatio);
  });

  it('PASS (M-085): MAX_DETOUR_RATIO is still the pure default when no override is supplied — never a behavior change for an existing caller that omits it', () => {
    expect(detourAllowanceSec(3600)).toBe(detourAllowanceSec(3600, undefined, undefined, MAX_DETOUR_RATIO));
  });

  it('PASS (M-086): thresholds are still not exposed as ordinary end-user configuration — there is no public mutator at all, admin or otherwise, on getMatchingThresholds itself', () => {
    expect(typeof getMatchingThresholds).toBe('function');
    expect(Object.keys(getMatchingThresholds)).toHaveLength(0); // no attached setter/config surface.
  });

  it('getMatchingThresholds itself stays pure — same values every call for the same profile, independent of any external state (the injectable value lives in detourAllowanceSec\'s own parameter, not here)', () => {
    const first = getMatchingThresholds('urban');
    const second = getMatchingThresholds('urban');
    expect(first).toEqual(second);
  });
});
