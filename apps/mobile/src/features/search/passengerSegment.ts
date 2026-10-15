import type { MatchCandidate } from '../../state/api';

export interface ResolvedSegmentPoint {
  /** The route_stop this point is, when it is one. */
  stopId?: string;
  label?: string;
  lat?: number;
  lng?: number;
}

interface Place {
  label: string;
  lat: number;
  lng: number;
}

interface RideEndpoints {
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
}

/**
 * The passenger-facing pickup and dropoff for one search result
 * (search/ride-details.tsx). Always the passenger's OWN journey — a
 * sub-segment of the driver's route — in this order of precedence:
 *
 *  1. the server's resolved point near the passenger's own origin/
 *     destination (`candidate.pickupPoint`/`dropoffPoint`) — the passenger
 *     never picks one themselves (docs/roadmap/phase-14-intelligent-
 *     pickup-engine.md);
 *  2. the passenger's own searched place;
 *  3. only then the ride's own endpoint (nothing else known yet).
 *
 * A 'detour' match uses the passenger's own searched places directly — the
 * driver comes to them. The driver's own destination is never the
 * passenger's dropoff merely because the ride ends there (the "Menzah 6 ->
 * La Marsa" bug, where the ride's last stop was used).
 */
export function resolvePassengerSegmentPoints(params: {
  candidate: MatchCandidate | undefined;
  searchOrigin: Place | null;
  searchDestination: Place | null;
  ride: RideEndpoints | undefined;
}): { pickup: ResolvedSegmentPoint; dropoff: ResolvedSegmentPoint } {
  const { candidate, searchOrigin, searchDestination, ride } = params;

  if (candidate?.matchType === 'detour') {
    return {
      pickup: {
        label: searchOrigin?.label ?? ride?.originLabel,
        lat: searchOrigin?.lat ?? ride?.originLat,
        lng: searchOrigin?.lng ?? ride?.originLng,
      },
      dropoff: {
        label: searchDestination?.label ?? ride?.destinationLabel,
        lat: searchDestination?.lat ?? ride?.destinationLat,
        lng: searchDestination?.lng ?? ride?.destinationLng,
      },
    };
  }

  const resolvedPickup = candidate?.pickupPoint ?? null;
  const resolvedDropoff = candidate?.dropoffPoint ?? null;
  return {
    pickup: {
      stopId: resolvedPickup ? (resolvedPickup.stopId ?? undefined) : candidate?.rankedStops[0]?.stopId,
      label:
        resolvedPickup?.label ??
        candidate?.rankedStops[0]?.label ??
        searchOrigin?.label ??
        ride?.originLabel,
      lat: resolvedPickup?.lat ?? searchOrigin?.lat ?? ride?.originLat,
      lng: resolvedPickup?.lng ?? searchOrigin?.lng ?? ride?.originLng,
    },
    dropoff: {
      stopId: resolvedDropoff?.stopId ?? undefined,
      label: resolvedDropoff?.label ?? searchDestination?.label ?? ride?.destinationLabel,
      lat: resolvedDropoff?.lat ?? searchDestination?.lat ?? ride?.destinationLat,
      lng: resolvedDropoff?.lng ?? searchDestination?.lng ?? ride?.destinationLng,
    },
  };
}
