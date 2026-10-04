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
 * Maximum straight-line distance between the passenger's own point and the
 * point where they board / alight, per trip profile. City and medium trips
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
