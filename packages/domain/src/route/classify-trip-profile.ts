import type { TripProfile, TripProfileType } from './trip-profile.types';

/**
 * Distance thresholds, in meters — a "commute" is a short intra-city hop
 * (the kind of trip a rider might join for 2-3km), "urban" covers most
 * everyday city-to-city-edge trips, and anything beyond is treated as
 * "intercity" (crosses between cities/governorates, real highway legs).
 * Chosen to bracket VAYA's real geography — Tunisia's largest urban areas
 * span roughly 15-20km end to end, and the shortest realistic intercity
 * corridor (e.g. Tunis-Hammamet-adjacent commuter towns) starts around
 * 40-50km.
 */
const COMMUTE_MAX_DISTANCE_M = 15_000;
const URBAN_MAX_DISTANCE_M = 45_000;

const PROFILE_BY_TYPE: Record<TripProfileType, Omit<TripProfile, 'type'>> = {
  // Dense sampling and a tight merge radius: a short hop has little room to
  // spread candidates out, so closer intervals surface more real options
  // without the corridor collapsing them all into one or two clusters.
  commute: { sampleIntervalM: 500, maxCandidates: 5, mergeRadiusM: 120 },
  // The existing defaults (stop-candidates.service.ts's SAMPLE_INTERVAL_M /
  // MAX_CANDIDATES, matching.service.ts's OVERLAP_CORRIDOR_WIDTH_M) were
  // tuned against this middle band — kept unchanged here as the "normal"
  // case, so a mid-length trip's stop suggestions don't shift under this
  // change.
  urban: { sampleIntervalM: 1000, maxCandidates: 8, mergeRadiusM: 150 },
  // Wider spacing (a driver on a highway leg won't take a detour every km)
  // but more total candidates, since a long intercity route passes through
  // more distinct towns worth offering as a stop.
  intercity: { sampleIntervalM: 2500, maxCandidates: 12, mergeRadiusM: 300 },
};

/**
 * Classifies a route by length into a `TripProfile` that tunes candidate
 * stop-suggestion density — pure, synchronous, no I/O, matching the rest of
 * `packages/domain`'s state-machine-and-computation modules. Distance alone
 * (not duration) drives the classification: duration is skewed by traffic
 * and road type in ways that track "how much of a detour is reasonable"
 * less reliably than raw distance does.
 */
export function classifyTripProfile(distanceM: number): TripProfile {
  const safeDistanceM = Math.max(0, distanceM);
  const type: TripProfileType =
    safeDistanceM <= COMMUTE_MAX_DISTANCE_M
      ? 'commute'
      : safeDistanceM <= URBAN_MAX_DISTANCE_M
        ? 'urban'
        : 'intercity';
  return { type, ...PROFILE_BY_TYPE[type] };
}
