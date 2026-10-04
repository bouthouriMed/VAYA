import type { TripProfileType } from '../route/trip-profile.types';

/**
 * How far a passenger is asked to go to reach (or leave) the car, and how
 * that distance is described to them. One source for the API (which
 * enforces the caps in search and booking) and the app (which only
 * displays what the API returned) — never two different estimates of the
 * same walk.
 */

/** Average walking pace (4.8 km/h). */
export const WALK_SPEED_M_PER_MIN = 80;

/**
 * Real streets are longer than the straight line between two points
 * (blocks, crossings, one-way detours on foot). 1.3 is the usual urban
 * circuity ratio; without it every displayed walk was ~30% too short.
 */
export const STREET_DISTANCE_FACTOR = 1.3;

/** Longest walk ever offered on a city or medium trip. */
export const MAX_CITY_WALK_MINUTES = 15;

/**
 * Longest access shown as a walk at all. Beyond this (only possible on an
 * intercity trip) the app shows a distance ("12 km from your departure")
 * instead of an unrealistic walking time.
 */
export const MAX_DISPLAYED_WALK_MINUTES = 20;

/**
 * On an intercity trip a meeting point a few km away is normal (a highway
 * exit, the edge of town) — the passenger gets there by taxi, louage or a
 * lift. Beyond this straight-line distance the ride doesn't serve them.
 */
export const MAX_INTERCITY_ACCESS_M = 10_000;

/** Straight-line distance that corresponds to `minutes` of real walking. */
export function straightLineMetersForWalkMinutes(minutes: number): number {
  return (minutes * WALK_SPEED_M_PER_MIN) / STREET_DISTANCE_FACTOR;
}

/**
 * Maximum straight-line distance for a point to count as "within walking
 * distance" — results within it always come first, per trip profile. City and medium trips
 * are capped at a 15-minute walk (~920 m straight line, ~1.2 km on foot);
 * intercity trips allow a meeting point further out.
 */
export function getPassengerAccessCaps(profile: TripProfileType): {
  pickupM: number;
  dropoffM: number;
} {
  if (profile === 'intercity')
    return { pickupM: MAX_INTERCITY_ACCESS_M, dropoffM: MAX_INTERCITY_ACCESS_M };
  const cityCapM = straightLineMetersForWalkMinutes(MAX_CITY_WALK_MINUTES);
  return { pickupM: cityCapM, dropoffM: cityCapM };
}

/**
 * How far a ride may be and still be shown at all — after every ride within
 * walking distance (getPassengerAccessCaps), never mixed in with them. A
 * passenger willing to take a taxi or get dropped off a few km away still
 * sees those rides, shown as a distance ("à 2,8 km"), not a walking time.
 * Beyond this the ride doesn't serve them. Tunable once real booking data
 * shows how far passengers actually go.
 */
export const MAX_EXTENDED_CITY_ACCESS_M = 3_000;
export const MAX_EXTENDED_INTERCITY_ACCESS_M = 20_000;

/** Straight-line reach for rides shown after the walkable ones. */
export function getPassengerExtendedReachCaps(profile: TripProfileType): {
  pickupM: number;
  dropoffM: number;
} {
  const reachM =
    profile === 'intercity' ? MAX_EXTENDED_INTERCITY_ACCESS_M : MAX_EXTENDED_CITY_ACCESS_M;
  return { pickupM: reachM, dropoffM: reachM };
}

/**
 * Whether both ends of a passenger's ride are within the comfortable cap —
 * the first key VAYA orders results by. `walkMeters` are street estimates
 * (estimateWalk); the caps are straight-line.
 */
export function isWithinWalkingDistance(
  profile: TripProfileType,
  pickupWalkMeters: number,
  dropoffWalkMeters: number,
): boolean {
  const caps = getPassengerAccessCaps(profile);
  // A hair of tolerance so a point exactly on the cap isn't misfiled by
  // floating-point round-tripping through the street factor.
  return (
    straightLineFromWalkMeters(pickupWalkMeters) <= caps.pickupM + 0.5 &&
    straightLineFromWalkMeters(dropoffWalkMeters) <= caps.dropoffM + 0.5
  );
}

export interface WalkEstimate {
  /** Estimated distance on foot (street distance, not straight line). */
  walkMeters: number;
  walkMinutes: number;
}

/** Honest walk estimate for a straight-line distance. */
export function estimateWalk(straightLineM: number): WalkEstimate {
  const walkMeters = Math.max(0, straightLineM) * STREET_DISTANCE_FACTOR;
  return { walkMeters, walkMinutes: walkMeters / WALK_SPEED_M_PER_MIN };
}

/** Straight-line distance back from an estimated street distance. */
export function straightLineFromWalkMeters(walkMeters: number): number {
  return walkMeters / STREET_DISTANCE_FACTOR;
}

export type PassengerAccessDisplay =
  { kind: 'walk'; minutes: number } | { kind: 'distance'; kilometers: number };

/**
 * How to describe the way from the passenger's point to the car: a walking
 * time when it is a reasonable walk (whole minutes, at least 1), otherwise
 * a distance in km (one decimal under 10 km) — never a 40-minute walk.
 */
export function describePassengerAccess(walkMeters: number): PassengerAccessDisplay {
  const minutes = walkMeters / WALK_SPEED_M_PER_MIN;
  if (minutes <= MAX_DISPLAYED_WALK_MINUTES) {
    return { kind: 'walk', minutes: Math.max(1, Math.round(minutes)) };
  }
  const km = walkMeters / 1000;
  return { kind: 'distance', kilometers: km < 10 ? Math.round(km * 10) / 10 : Math.round(km) };
}
