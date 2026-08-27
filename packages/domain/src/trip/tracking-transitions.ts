import { haversineDistanceMeters } from '../recurring/recurring-geo';
import { canTransitionTripStatus, type TripStatus } from './trip-status';

// Live tracking (docs/domain/live-tracking.md): proximity-based automatic
// trip-status advances, evaluated server-side on every driver location
// update. Reduces the driver's manual taps to just "Start journey" and
// "Passenger picked up" (boarding genuinely can't be GPS-detected) — arrival
// at pickup and arrival near the destination are both things the driver's
// own position already tells us.
export const PICKUP_ARRIVAL_RADIUS_M = 150;
export const DESTINATION_APPROACH_RADIUS_M = 500;
// Tighter than DESTINATION_APPROACH_RADIUS_M on purpose — "arriving" (500m)
// just means "nearly there", not "actually parked at the destination".
// World-class carpooling apps (BlaBlaCar included) auto-close a trip once
// GPS genuinely confirms arrival rather than leaving it "in progress"
// forever if the driver forgets or skips "Terminer le trajet" — this is
// that confirmation radius, tight enough that a driver merely passing
// nearby on the way to somewhere else can't trigger it.
export const DESTINATION_ARRIVED_RADIUS_M = 80;

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Given the driver's current fix and a trip's current status, returns the
 * new `TripStatus` to transition to, or `null` if no automatic transition
 * applies right now. Pure — the caller (trips.service.ts) is responsible for
 * persisting the result and is free to ignore it (e.g. the transition table
 * already disallows it for some edge-case current status).
 */
export function computeAutoTripStatusTransition(
  currentStatus: TripStatus,
  currentPos: LatLng,
  pickupPos: LatLng,
  destinationPos: LatLng,
): TripStatus | null {
  if (currentStatus === 'driver_approaching') {
    const distanceToPickup = haversineDistanceMeters(currentPos, pickupPos);
    if (distanceToPickup <= PICKUP_ARRIVAL_RADIUS_M && canTransitionTripStatus(currentStatus, 'pickup')) {
      return 'pickup';
    }
  }

  if (currentStatus === 'active') {
    const distanceToDestination = haversineDistanceMeters(currentPos, destinationPos);
    if (
      distanceToDestination <= DESTINATION_APPROACH_RADIUS_M &&
      canTransitionTripStatus(currentStatus, 'arriving')
    ) {
      return 'arriving';
    }
  }

  // Auto-completion: only from `arriving`, never straight from `active` —
  // a single close-enough fix isn't proof of arrival on its own (GPS jumps,
  // a route that happens to pass within range), but *already being*
  // `arriving` means a prior ping already confirmed the driver was
  // genuinely closing in, so a second, tighter-radius confirmation is
  // trustworthy enough to close the loop without a manual tap.
  if (currentStatus === 'arriving') {
    const distanceToDestination = haversineDistanceMeters(currentPos, destinationPos);
    if (
      distanceToDestination <= DESTINATION_ARRIVED_RADIUS_M &&
      canTransitionTripStatus(currentStatus, 'completed')
    ) {
      return 'completed';
    }
  }

  return null;
}
