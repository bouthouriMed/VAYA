import type { TripProfileType } from '../route/trip-profile.types';
import type { MatchingThresholds, MatchingThresholdsByProfile } from './matching-thresholds.types';

/**
 * Today's flat matching constants (2km/3km/8km/10km/150m corridor,
 * 3-12min detour allowance) kept verbatim as the `urban` row — introducing
 * this table changes nothing about a mid-length trip's search behavior.
 * The `commute`/`intercity` rows are reasoned multipliers on that baseline
 * (matching-engine architecture plan, §G "Urban vs. intercity
 * intelligence"), explicitly a HYPOTHESIS pending real search/booking
 * outcome data to calibrate — a concrete, admin-tunable revisit target
 * once that data exists, not a settled set of numbers. `packages/domain`
 * has no config-table/I-O dependency of its own; the API layer is what
 * will eventually read an admin override and fall back to this table,
 * mirroring `default-pricing-config.ts`'s existing "pure default, no I/O"
 * precedent.
 */
const MATCHING_THRESHOLDS_BY_PROFILE: MatchingThresholdsByProfile = {
  commute: {
    tightPickupRadiusM: 1_000,
    tightDropoffRadiusM: 1_500,
    widePickupRadiusM: 4_000,
    wideDropoffRadiusM: 5_000,
    corridorWidthM: 100,
    detourFloorSec: 180, // 3 min — already a sensible floor at any trip length, unchanged.
    detourCeilingSec: 420, // 7 min — a short hop shouldn't be asked to absorb a 12-minute detour.
  },
  urban: {
    tightPickupRadiusM: 2_000,
    tightDropoffRadiusM: 3_000,
    widePickupRadiusM: 8_000,
    wideDropoffRadiusM: 10_000,
    corridorWidthM: 150,
    detourFloorSec: 180,
    detourCeilingSec: 720,
  },
  intercity: {
    tightPickupRadiusM: 5_000,
    tightDropoffRadiusM: 7_500,
    widePickupRadiusM: 20_000,
    wideDropoffRadiusM: 25_000,
    corridorWidthM: 250,
    detourFloorSec: 300, // 5 min — a long haul's detour floor can afford to be a little higher too.
    detourCeilingSec: 1_200, // 20 min — a long intercity route can reasonably absorb a bigger detour.
  },
};

/**
 * Returns the matching thresholds for a given trip-length profile — pure,
 * synchronous, no I/O, matching `packages/domain`'s existing convention
 * (`classifyTripProfile`, `computeSuggestedPrice`, etc.).
 */
export function getMatchingThresholds(type: TripProfileType): MatchingThresholds {
  return MATCHING_THRESHOLDS_BY_PROFILE[type];
}

/**
 * Real detour budget for a freehand 'via' stop a driver picks by searching
 * a named place (city/town) rather than dropping a pin
 * (apps/api's stop-candidates.service.ts — moved here, out of the API
 * layer, so matching.service.ts's joint-stop-score resolution can share
 * the exact same number without an apps/api-internal circular import
 * between the rides and matching modules) — deliberately much larger than
 * that module's own MAX_DEVIATION_METERS/MAX_DEVIATION_SECONDS, which
 * bound only the auto-generated ON-ROUTE micro-stops sampled every ~1km. A
 * driver publishing a real intercity route (e.g. a highway corridor
 * between two cities) can genuinely be willing to exit and detour into a
 * city several km/minutes off the direct line — a real product gap the
 * tight micro-stop budget was never meant to cover. Scaled by trip profile
 * so a short commute doesn't silently accept an absurd detour a driver
 * never actually intended.
 *
 * `intercity` widened (15km/20min -> 30km/40min) after direct product
 * feedback on a real reported case (Zaragoza on a Tarragona->Bilbao
 * route) — live-verified the real, Google-Routes-computed polyline for
 * that exact corridor already passes within ~3.5km of Zaragoza (so the
 * 15km budget alone wasn't the blocker for a freshly-routed ride), but a
 * long intercity trip's own real-world detour tolerance is genuinely
 * larger than 15km/20min — a 500km+, 5+ hour trip reasonably justifies a
 * 20-30km, ~30min detour to serve a real city, matching how real
 * long-distance carpooling actually works. `urban`/`commute` widened
 * proportionally for the same reason at their own scale.
 */
export const VIA_STOP_DETOUR_BUDGET: Record<TripProfileType, { maxMeters: number; maxSeconds: number }> = {
  commute: { maxMeters: 3000, maxSeconds: 600 },
  urban: { maxMeters: 10000, maxSeconds: 900 },
  intercity: { maxMeters: 30000, maxSeconds: 2400 },
};

// Detour tolerance as a fraction of the ride's own baseline duration — a
// fixed-minutes bound would be simultaneously too loose on a 10-minute
// urban hop and too tight on a 3-hour intercity trip. HYPOTHESIS: no usage
// data exists yet to calibrate this precisely. Exported (not just used
// internally by detourAllowanceSec below) because matching.service.ts's own
// score formula also reads it directly.
export const MAX_DETOUR_RATIO = 0.25;

/**
 * How much extra driving time a detour candidate is allowed to cost the
 * driver, given the ride's real baseline duration — the actual bound both
 * the matching engine's detour-match tier (apps/api's matching.service.ts)
 * and booking creation (apps/api's bookings.service.ts, validating a
 * free-form pickup/dropoff on a ride that has stops) enforce, so a match
 * search ever surfaces is never rejected by booking's own independent
 * check applying a different number — one real bound, shared, not
 * duplicated per CLAUDE.md's ride-engine-logic-belongs-in-domain rule.
 * `floorSec`/`ceilingSec` default to the 'urban' profile's own
 * detourFloorSec/detourCeilingSec — callers with a real trip profile
 * should pass that profile's own values instead (see
 * getMatchingThresholds).
 */
export function detourAllowanceSec(
  baselineDurationSec: number,
  floorSec: number = MATCHING_THRESHOLDS_BY_PROFILE.urban.detourFloorSec,
  ceilingSec: number = MATCHING_THRESHOLDS_BY_PROFILE.urban.detourCeilingSec,
): number {
  const ratioAllowance = baselineDurationSec * MAX_DETOUR_RATIO;
  return Math.min(ceilingSec, Math.max(floorSec, ratioAllowance));
}
