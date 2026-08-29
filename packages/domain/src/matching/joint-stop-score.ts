/**
 * M-039 (docs/unified_driver_and_passenger_journey.md §13 "Passenger
 * Pickup/Drop-off Optimization"): "Optimization considers both: Passenger
 * (walking time, distance, ...) Driver (detour distance, detour time, road
 * feasibility, stopping/parking feasibility, route continuity). The
 * recommended point should be the best practical compromise."
 *
 * Before this module, the two halves of that optimization never actually
 * met: apps/api's stop-candidates.service.ts computes a real driver-side
 * cost/suitability score for every candidate stop at ride-publish time
 * (route_stops.suitabilityScore/deviationMeters — road classification,
 * there-and-back detour cost), but matching.service.ts's
 * rankStopsByWalkDistance, the function that actually decides which stop a
 * passenger is offered, discards that entirely and ranks by passenger walk-
 * distance alone — "two disconnected single-objective passes" (generation
 * scores driver-only; ranking scores passenger-only), exactly the audit's
 * own description of the gap.
 *
 * This is additive, not a replacement for rankStopsByWalkDistance (still
 * genuinely useful as a real "closest by foot" ordering/display value) —
 * it answers a different question: which of a ride's *already walkable*
 * stops is VAYA's own actual recommendation, considering both sides at
 * once. Pure: no I/O, the caller supplies each stop's already-computed
 * walk distance (haversine) and its own stored suitability/deviation
 * fields.
 */

export interface StopJointScoreInput {
  /** Real straight-line distance from the passenger's actual requested
   *  point to this stop, in meters. */
  walkDistanceMeters: number;
  /** Normalization ceiling for the passenger-side component — typically
   *  the search tier's own wide pickup/dropoff radius for this trip
   *  profile, so "getting further from feasible" reads consistently with
   *  how the rest of matching already scores distance. */
  maxWalkDistanceMeters: number;
  /** 0..1, already computed at stop-generation time
   *  (stop-candidates.service.ts's scoreStopCandidate) from real road
   *  classification/suitability — the driver-side signal this function
   *  exists to stop discarding. */
  suitabilityScore: number;
  /** The driver's real there-and-back detour cost to serve this stop,
   *  meters (route_stops.deviationMeters). */
  deviationMeters: number;
  /** Normalization ceiling for the deviation component — the largest
   *  deviation any stop on this ride could have been accepted with (an
   *  auto-generated micro-stop's own MAX_DEVIATION_METERS, or a much wider
   *  freehand "via" city stop's own profile-scaled budget) so both stop
   *  kinds share one coherent 0..1 scale. */
  maxDeviationMeters: number;
}

// HYPOTHESIS, not calibrated against real outcome data (same category as
// this codebase's other scoring weight choices, e.g. buildEndpointCandidate's
// 0.4/0.3/0.3 split in matching.service.ts) — passenger convenience weighted
// somewhat higher than driver cost, since a stop only reaches this function
// at all once it has already cleared both sides' hard feasibility gates
// (walkable radius, MAX_DEVIATION_METERS/VIA_STOP_DETOUR_BUDGET) — what's
// left to decide between surviving candidates is mostly "which is more
// convenient for the passenger", with driver cost as a real, not cosmetic,
// tie-breaker.
const PASSENGER_WEIGHT = 0.6;
const DRIVER_WEIGHT = 0.4;
// Within the driver component, suitability (road-classification quality)
// and deviation (real detour cost) are weighted evenly — the spec lists
// both "road feasibility" and "detour distance/time" as first-class
// dimensions with no stated priority between them.
const SUITABILITY_WEIGHT = 0.5;
const DEVIATION_WEIGHT = 0.5;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * The joint score itself — 0..1, higher is better. See the module doc
 * comment for the full reasoning behind combining these two sides at all,
 * and for the specific weights below.
 */
export function computeJointStopScore(input: StopJointScoreInput): number {
  const walkComponent = clamp01(1 - input.walkDistanceMeters / Math.max(1, input.maxWalkDistanceMeters));
  const deviationComponent = clamp01(1 - input.deviationMeters / Math.max(1, input.maxDeviationMeters));
  const driverComponent =
    deviationComponent * DEVIATION_WEIGHT + clamp01(input.suitabilityScore) * SUITABILITY_WEIGHT;
  return walkComponent * PASSENGER_WEIGHT + driverComponent * DRIVER_WEIGHT;
}

export interface JointStopCandidate {
  stopId: string;
  walkDistanceMeters: number;
  suitabilityScore: number;
  deviationMeters: number;
}

export interface JointStopRankResult {
  stopId: string;
  jointScore: number;
}

/**
 * Ranks a set of already-walkable stops by their joint score, descending —
 * `results[0]` is VAYA's own genuine recommendation (M-039's "best practical
 * compromise"), not merely the closest stop by foot.
 */
export function rankStopsByJointOptimum(
  candidates: JointStopCandidate[],
  maxWalkDistanceMeters: number,
  maxDeviationMeters: number,
): JointStopRankResult[] {
  return candidates
    .map((c) => ({
      stopId: c.stopId,
      jointScore: computeJointStopScore({
        walkDistanceMeters: c.walkDistanceMeters,
        maxWalkDistanceMeters,
        suitabilityScore: c.suitabilityScore,
        deviationMeters: c.deviationMeters,
        maxDeviationMeters,
      }),
    }))
    .sort((a, b) => b.jointScore - a.jointScore);
}
