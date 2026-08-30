import { haversineDistanceMeters } from '../recurring/recurring-geo';

/**
 * "Same journey" request grouping (spec §20 — matrix M-051/052/055/056/058,
 * EDGE-grouping-1/2, EDGE-049, INV-03): "A passenger may hold up to 3 active
 * requests for the SAME journey (not unlimited)... First acceptance wins:
 * accepting Driver A confirms it and auto-cancels/closes all other pending
 * requests for the same journey."
 *
 * The spec assumes requests can be grouped as "the same journey" but never
 * defines the grouping key (ambiguity log A-5, docs/tdd_journey_test_matrix.md).
 * This module adopts, as the real implementation (not merely a test
 * fixture convention), the interpretation that log already proposed as the
 * smallest defensible reading: same rider, requested pickup within a small
 * radius, requested dropoff within a small radius, requested within a
 * short shared time window — proxied here by each booking's actual
 * resolved pickup/dropoff/requestedAt, the only "what did the passenger
 * ask for" data a booking row carries. VAYA operational policy (spec §28)
 * — first-cut defaults, not settled product numbers.
 *
 * Pure module: no I/O. The caller (bookings.service.ts) is responsible for
 * fetching the rider's other active bookings and passing them in.
 */
export const SAME_JOURNEY_PICKUP_RADIUS_METERS = 500;
export const SAME_JOURNEY_DROPOFF_RADIUS_METERS = 500;
export const SAME_JOURNEY_TIME_WINDOW_MINUTES = 30;
export const MAX_ACTIVE_REQUESTS_PER_JOURNEY = 3;

export interface JourneyRequestPoint {
  riderId: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  requestedAt: Date;
}

export interface SameJourneyThresholds {
  pickupRadiusMeters: number;
  dropoffRadiusMeters: number;
  timeWindowMinutes: number;
}

export const DEFAULT_SAME_JOURNEY_THRESHOLDS: SameJourneyThresholds = {
  pickupRadiusMeters: SAME_JOURNEY_PICKUP_RADIUS_METERS,
  dropoffRadiusMeters: SAME_JOURNEY_DROPOFF_RADIUS_METERS,
  timeWindowMinutes: SAME_JOURNEY_TIME_WINDOW_MINUTES,
};

/**
 * M-085a (spec §28): thresholds are injectable, not just exported named
 * constants — mirrors `detourAllowanceSec`'s established override pattern.
 * Omitting `thresholds` keeps today's default behavior exactly as it was.
 */
export function isSameJourneyRequest(
  a: JourneyRequestPoint,
  b: JourneyRequestPoint,
  thresholds: SameJourneyThresholds = DEFAULT_SAME_JOURNEY_THRESHOLDS,
): boolean {
  if (a.riderId !== b.riderId) return false;

  const pickupDistance = haversineDistanceMeters(
    { lat: a.pickupLat, lng: a.pickupLng },
    { lat: b.pickupLat, lng: b.pickupLng },
  );
  if (pickupDistance > thresholds.pickupRadiusMeters) return false;

  const dropoffDistance = haversineDistanceMeters(
    { lat: a.dropoffLat, lng: a.dropoffLng },
    { lat: b.dropoffLat, lng: b.dropoffLng },
  );
  if (dropoffDistance > thresholds.dropoffRadiusMeters) return false;

  const minutesApart = Math.abs(a.requestedAt.getTime() - b.requestedAt.getTime()) / 60_000;
  return minutesApart <= thresholds.timeWindowMinutes;
}

/**
 * Given a candidate new request and the rider's other currently-active
 * (pending/accepted) requests, returns the subset that represent the same
 * journey — used both to enforce the MAX_ACTIVE_REQUESTS_PER_JOURNEY cap
 * (M-051/052) and to find the siblings to auto-close on first acceptance
 * (M-055/056).
 */
export function findSameJourneySiblings<T extends JourneyRequestPoint>(
  candidate: JourneyRequestPoint,
  otherActiveRequests: readonly T[],
  thresholds: SameJourneyThresholds = DEFAULT_SAME_JOURNEY_THRESHOLDS,
): T[] {
  return otherActiveRequests.filter((other) => isSameJourneyRequest(candidate, other, thresholds));
}
