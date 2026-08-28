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
