import type { CreateBookingInput } from '@vaya/validation';
import type { MatchCandidate } from '../../state/api';

interface Place {
  label: string;
  lat: number;
  lng: number;
}

type BookingPoints = Pick<
  CreateBookingInput,
  | 'pickupStopId'
  | 'pickup'
  | 'requestedPickup'
  | 'pickupMeetingPointId'
  | 'dropoffStopId'
  | 'dropoff'
  | 'requestedDropoff'
  | 'dropoffMeetingPointId'
>;

/**
 * The pickup/drop-off half of a seat request, taken straight from what the
 * server chose for this passenger (docs/roadmap/phase-14-intelligent-
 * pickup-engine.md: the passenger never picks a point). Exactly the pair
 * search/ride-details.tsx shows — a driver stop, a point on the driver's
 * route, or the passenger's own place for a detour match — never something
 * the client invents. createBooking re-validates every one of them.
 *
 * Without a candidate (the screen was opened outside a search) there is
 * nothing to book against but the passenger's own searched place.
 */
export function buildBookingPoints(params: {
  candidate: MatchCandidate | undefined;
  searchOrigin: Place | null;
  searchDestination: Place | null;
}): BookingPoints | null {
  const { candidate, searchOrigin, searchDestination } = params;
  const requestedPickup = searchOrigin ? { requestedPickup: toPlace(searchOrigin) } : {};
  const requestedDropoff = searchDestination ? { requestedDropoff: toPlace(searchDestination) } : {};

  if (!candidate) {
    return searchOrigin ? { pickup: toPlace(searchOrigin) } : null;
  }

  if (candidate.matchType === 'detour') {
    // The driver comes to the passenger's own places.
    if (!searchOrigin) return null;
    const ridesToTheirDestination =
      searchDestination &&
      !(searchDestination.lat === candidate.destinationLat && searchDestination.lng === candidate.destinationLng);
    return {
      pickup: toPlace(searchOrigin),
      ...(ridesToTheirDestination ? { dropoff: toPlace(searchDestination) } : {}),
    };
  }

  const { pickupPoint, dropoffPoint } = candidate;
  if (!pickupPoint) return null;
  // A point on the driver's route carries no label of its own; it is shown
  // (and recorded) as the passenger's own place, which it sits next to.
  const pickupLabel = pickupPoint.label ?? searchOrigin?.label;
  const dropoffLabel = dropoffPoint?.label ?? searchDestination?.label;
  if (!pickupPoint.stopId && !pickupLabel) return null;

  const pickup: BookingPoints = pickupPoint.stopId
    ? { pickupStopId: pickupPoint.stopId, ...requestedPickup }
    : {
        pickup: {
          label: pickupLabel!,
          lat: pickupPoint.lat,
          lng: pickupPoint.lng,
        },
        ...requestedPickup,
        ...(pickupPoint.meetingPointId ? { pickupMeetingPointId: pickupPoint.meetingPointId } : {}),
      };

  // No dropoff field at all means "the ride's own destination" server-side.
  const atRideDestination =
    !dropoffPoint ||
    (dropoffPoint.lat === candidate.destinationLat && dropoffPoint.lng === candidate.destinationLng);
  const dropoff: BookingPoints | null = !dropoffPoint || atRideDestination
    ? {}
    : dropoffPoint.stopId
      ? { dropoffStopId: dropoffPoint.stopId, ...requestedDropoff }
      : dropoffLabel
        ? {
          dropoff: {
            label: dropoffLabel,
            lat: dropoffPoint.lat,
            lng: dropoffPoint.lng,
          },
          ...(dropoffPoint.meetingPointId ? { dropoffMeetingPointId: dropoffPoint.meetingPointId } : {}),
        }
        : null;
  if (dropoff === null) return null;

  return { ...pickup, ...dropoff };
}

function toPlace(place: Place): Place {
  return { label: place.label, lat: place.lat, lng: place.lng };
}
