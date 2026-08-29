/**
 * Existing-passenger soft-protection thresholds (spec §27/§28 — journey-contract
 * matrix M-083/M-084/M-085/EDGE-052/INV-09). VAYA operational policy: owned by
 * VAYA, configured via the Admin Panel, never exposed to passengers or ordinary
 * drivers (docs/unified_driver_and_passenger_journey.md §28 "VAYA Operational
 * Policy Configuration"). This is a pure default — the API layer is what will
 * eventually read an admin override and fall back to this, mirroring
 * `default-pricing-config.ts`'s and `matching-thresholds.ts`'s established
 * "pure default, no I/O" precedent. `packages/domain` has no config-table/I-O
 * dependency of its own.
 */
export interface ExistingPassengerImpactThresholds {
  /** Added delay as a fraction of the existing passenger's own remaining trip
   *  duration, above which the impact is unacceptable — ratio-relative, not a
   *  flat-minutes cap, so the same absolute delay is judged differently on a
   *  short vs. long remaining trip. Mirrors `MAX_DETOUR_RATIO`'s shape
   *  (matching-thresholds.ts) for consistency with the one other
   *  ratio-of-baseline threshold already shipped. */
  maxDelayRatio: number;
  /** An absolute ceiling in minutes, independent of ratio — a very long trip
   *  could otherwise tolerate an unreasonably large absolute delay under the
   *  ratio alone. */
  maxAbsoluteDelayMinutes: number;
}

/**
 * First-cut default, explicitly pending business confirmation — same category
 * as pricing's `base_rate_per_km` (CLAUDE.md's "Important decisions"), not a
 * settled product number. `maxDelayRatio: 0.25` sits comfortably between the
 * spec's own worked "+15min/3h ≈ 8.3%, acceptable" example and a clearly
 * unacceptable "+60min/3h ≈ 33%" case, and reuses `MAX_DETOUR_RATIO`'s exact
 * value for consistency (both express "a quarter of the baseline duration is
 * the outer bound of a soft protection"). `maxAbsoluteDelayMinutes: 45` is a
 * genuine outer ceiling for very long trips where 25% could otherwise still
 * mean an unreasonable absolute delay.
 */
export const DEFAULT_EXISTING_PASSENGER_IMPACT_THRESHOLDS: ExistingPassengerImpactThresholds = {
  maxDelayRatio: 0.25,
  maxAbsoluteDelayMinutes: 45,
};
