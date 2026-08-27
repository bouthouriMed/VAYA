import type { TripProfileType } from '../route/trip-profile.types';

/**
 * Search-time distance/time tolerances the matching engine applies, scaled
 * by the requested trip's `TripProfileType` (packages/domain's route
 * classifier) instead of one flat set of numbers for every trip length — a
 * 2km pickup radius that's reasonable for a 3km commute is unreasonably
 * tight for a 300km intercity search, and a corridor width tuned for a
 * highway leg is too loose for a dense urban commute.
 */
export interface MatchingThresholds {
  /** "exact" tier pickup/dropoff radii, meters. */
  tightPickupRadiusM: number;
  tightDropoffRadiusM: number;
  /** "wide_corridor"/"closest_departure" tier pickup/dropoff radii, meters. */
  widePickupRadiusM: number;
  wideDropoffRadiusM: number;
  /** route_passthrough tier's corridor width, meters — how close a rider's
   *  origin/destination must project onto a candidate ride's real route to
   *  count as "on this route". Distinct from
   *  `matching.service.ts`'s exported `OVERLAP_CORRIDOR_WIDTH_M`, which
   *  stays fixed at 150m for driver-side stop clustering at publish time —
   *  an unrelated concept this profile-scaling must never touch. */
  corridorWidthM: number;
  /** detour_match tier's absolute floor/ceiling layered on top of the
   *  ratio-based allowance (`matching.service.ts`'s `detourAllowanceSec`) —
   *  a fixed-minutes bound alone would be too loose for a short commute and
   *  too tight for a long intercity trip; profile-scaling the floor/ceiling
   *  fixes that without touching the ratio math itself. */
  detourFloorSec: number;
  detourCeilingSec: number;
}

export type MatchingThresholdsByProfile = Record<TripProfileType, MatchingThresholds>;
