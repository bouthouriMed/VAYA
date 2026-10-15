import type { TripProfileType } from '../route/trip-profile.types';
import { STREET_DISTANCE_FACTOR, WALK_SPEED_M_PER_MIN, MAX_DISPLAYED_WALK_MINUTES } from './passenger-access';

/**
 * Phase 14 (docs/roadmap/phase-14-intelligent-pickup-engine.md, Track D):
 * which place VAYA proposes as a passenger's pickup or drop-off on a given
 * ride, weighing both people at once — the passenger's way there and the
 * driver's extra driving — in one common unit, seconds.
 *
 * City trips (a daily commute): the passenger walks, so their cost is the
 * walking time. Intercity trips: a meeting point a few km away is normal
 * (they take a taxi, a louage or get a lift), so access costs less per
 * metre once it's beyond a walk. Recognizable places — a louage station, a
 * metro or bus station, a petrol station — are easier to find and safer to
 * stop at than a bare point on the road, and count in their favour.
 *
 * Pure; every weight is a HYPOTHESIS until real accept/decline data exists,
 * admin-tunable through the operational config (Track E).
 */

export const MEETING_POINT_KINDS = [
  'transit_station',
  'bus_stop',
  'louage_station',
  'fuel_station',
  'roundabout',
  'highway_exit',
] as const;
export type MeetingPointKind = (typeof MEETING_POINT_KINDS)[number];

/** A candidate place: a known meeting point, a driver stop, or a bare
 *  point on the driver's route (`on_route`). */
export type MeetingOptionKind = MeetingPointKind | 'driver_stop' | 'on_route';

export interface MeetingWeights {
  /** Cost per second of a city walk. */
  cityWalkWeight: number;
  /** Cost per second of reaching an intercity pickup (walk or taxi). */
  intercityAccessWeight: number;
  /** Cost per second of the driver's extra driving. Above 1: a minute of
   *  the driver's time (and their other passengers') weighs more. */
  detourWeight: number;
  /** Seconds credited per completed trip that used this point (capped). */
  usageBoostSeconds: number;
  /** Seconds credited when the point is inside an area the driver said
   *  they'd pass by. */
  areaBoostSeconds: number;
}

export const DEFAULT_MEETING_WEIGHTS: MeetingWeights = {
  cityWalkWeight: 1,
  intercityAccessWeight: 0.5,
  detourWeight: 1.5,
  usageBoostSeconds: 15,
  areaBoostSeconds: 120,
};

/** Usage stops adding credit beyond this many trips. */
export const MEETING_USAGE_CAP = 20;

/** Seconds credited (negative) or charged (positive) for the kind of place. */
const KIND_ADJUSTMENT_SECONDS: Record<MeetingOptionKind, number> = {
  louage_station: -90,
  transit_station: -90,
  fuel_station: -90,
  bus_stop: -45,
  roundabout: -45,
  highway_exit: -45,
  // The driver already offered it: no surprise for anyone.
  driver_stop: -60,
  // A bare point on the road: harder to find, may not be a safe stop.
  on_route: 120,
};

/** Taxi / louage speed in town on the way to an intercity pickup. */
const ACCESS_RIDE_SPEED_M_PER_S = 7;
/** Finding a taxi or louage at all. */
const ACCESS_RIDE_OVERHEAD_S = 300;
/** Average speed of the short extra driving to a roadside point. */
const DETOUR_SPEED_M_PER_S = 8.3;

/**
 * The driver's extra driving, in seconds, to stop at a point this far from
 * their route (there and back at ~30 km/h). Zero on the route itself.
 */
export function estimateRoadsideDetourSeconds(distanceFromRouteM: number): number {
  return (2 * Math.max(0, distanceFromRouteM)) / DETOUR_SPEED_M_PER_S;
}

/** The passenger's way to the point, in seconds: walking in town; walking
 *  or a short ride for an intercity trip, whichever is realistic. */
export function passengerAccessSeconds(straightLineM: number, profile: TripProfileType): number {
  const walkSeconds = ((Math.max(0, straightLineM) * STREET_DISTANCE_FACTOR) / WALK_SPEED_M_PER_MIN) * 60;
  if (profile !== 'intercity' || walkSeconds <= MAX_DISPLAYED_WALK_MINUTES * 60) return walkSeconds;
  return ACCESS_RIDE_OVERHEAD_S + (straightLineM * STREET_DISTANCE_FACTOR) / ACCESS_RIDE_SPEED_M_PER_S;
}

export interface MeetingOptionInput {
  kind: MeetingOptionKind;
  /** Straight line from the passenger's own place to this point. */
  accessStraightLineM: number;
  /** The driver's extra driving to stop here, seconds. */
  detourSeconds: number;
  usageCount?: number;
  inDriverArea?: boolean;
}

/** Total cost in seconds — lower is better. */
export function scoreMeetingOption(
  option: MeetingOptionInput,
  profile: TripProfileType,
  weights: MeetingWeights = DEFAULT_MEETING_WEIGHTS,
): number {
  const accessWeight = profile === 'intercity' ? weights.intercityAccessWeight : weights.cityWalkWeight;
  const usage = Math.min(Math.max(0, option.usageCount ?? 0), MEETING_USAGE_CAP);
  return (
    accessWeight * passengerAccessSeconds(option.accessStraightLineM, profile) +
    weights.detourWeight * Math.max(0, option.detourSeconds) +
    KIND_ADJUSTMENT_SECONDS[option.kind] -
    usage * weights.usageBoostSeconds -
    (option.inDriverArea ? weights.areaBoostSeconds : 0)
  );
}

/** The lowest-cost option, or null for none. Ties keep the input order. */
export function pickBestMeetingOption<T extends MeetingOptionInput>(
  options: T[],
  profile: TripProfileType,
  weights: MeetingWeights = DEFAULT_MEETING_WEIGHTS,
): T | null {
  let best: T | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const option of options) {
    const cost = scoreMeetingOption(option, profile, weights);
    if (cost < bestCost) {
      best = option;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * How wide an area a driver adds as a stop ("via Sidi Hassine") counts as,
 * by the ride's own length: a neighbourhood on a city trip, a town on an
 * intercity one. Meeting points inside it get the area credit.
 */
export const DRIVER_AREA_RADIUS_M = { commute: 1500, urban: 2500, intercity: 6000 } as const;

export function driverAreaRadiusM(routeLengthM: number): number {
  if (routeLengthM <= 15_000) return DRIVER_AREA_RADIUS_M.commute;
  if (routeLengthM <= 45_000) return DRIVER_AREA_RADIUS_M.urban;
  return DRIVER_AREA_RADIUS_M.intercity;
}
