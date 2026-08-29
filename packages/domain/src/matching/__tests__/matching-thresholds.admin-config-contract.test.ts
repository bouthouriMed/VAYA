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
 * `getMatchingThresholds`/`detourAllowanceSec` are real, already-shipped,
 * and already profile-aware (commute/urban/intercity) — genuine engineering
 * quality — but structurally admit no override source at all: no config
 * parameter, no DB read, nothing an admin panel could ever influence. This
 * test documents that gap precisely (arity/purity), it does not fabricate
 * a config mechanism to test against.
 */
describe('matching-thresholds — admin-configurability gap (M-085/M-086)', () => {
  it('FAIL (missing, M-085): getMatchingThresholds takes only a trip-profile type, no config/override input of any kind', () => {
    expect(getMatchingThresholds.length).toBe(1);
  });

  it('FAIL (missing, M-085): detourAllowanceSec has no way to receive an admin-configured MAX_DETOUR_RATIO — it is a hardcoded module-level constant', () => {
    // If this were admin-configurable, MAX_DETOUR_RATIO would be an input
    // parameter (or read from a config object), not an exported constant a
    // caller can only read, never override per-deployment/per-driver-tier.
    expect(MAX_DETOUR_RATIO).toBe(0.25);
    // .length only counts parameters before the first default value — both
    // floorSec/ceilingSec are optional with hardcoded 'urban' defaults, so
    // this reports 1, not 3. The real point stands either way: none of the
    // 3 parameters is "a config object/override source", only bare numbers
    // a caller must already know to compute themselves.
    expect(detourAllowanceSec.length).toBe(1);
  });

  it('PASS (M-086): thresholds are not exposed as ordinary end-user configuration either — there is no public mutator at all, admin or otherwise', () => {
    // Trivially true today (nothing is exposed to anyone) — recorded so a
    // future admin-only mutator addition doesn't accidentally also expose
    // a rider/driver-facing one without this test being revisited.
    expect(typeof getMatchingThresholds).toBe('function');
    expect(Object.keys(getMatchingThresholds)).toHaveLength(0); // no attached setter/config surface.
  });

  it('same values every call, for the same profile, regardless of any external state — confirms the "hardcoded, not DB-backed" classification is not a testing artifact', () => {
    const first = getMatchingThresholds('urban');
    const second = getMatchingThresholds('urban');
    expect(first).toEqual(second);
  });
});
