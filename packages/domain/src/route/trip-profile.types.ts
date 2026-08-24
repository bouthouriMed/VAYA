export type TripProfileType = 'commute' | 'urban' | 'intercity';

/** Tunes how densely a route is sampled for candidate stop-suggestion
 *  points (apps/api/src/modules/rides/stop-candidates.service.ts) — a short
 *  commute needs closer-together, more numerous stop options near where
 *  people actually live/work along it, while a long intercity haul needs
 *  wider spacing (a driver won't detour every 500m on a highway leg) but
 *  can still offer more total stops since the route passes through more
 *  distinct towns. */
export interface TripProfile {
  type: TripProfileType;
  sampleIntervalM: number;
  maxCandidates: number;
  mergeRadiusM: number;
}
