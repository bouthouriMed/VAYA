import { describe, it, expect } from 'vitest';
import { resolvePassengerSegmentPoints } from '../passengerSegment';
import type { MatchCandidate } from '../../../state/api';

// The reported bug: driver Cité Tahrir -> La Marsa (19:10), passenger
// Menzah 6 -> Lac 2 (19:20). The passenger was shown "Menzah 6 -> La Marsa".
const ride = {
  originLabel: 'Cité Tahrir, Tunis',
  originLat: 36.826,
  originLng: 10.14,
  destinationLabel: 'La Marsa',
  destinationLat: 36.878,
  destinationLng: 10.324,
};
const searchOrigin = { label: 'Menzah 6, Tunis', lat: 36.8495, lng: 10.1735 };
const searchDestination = { label: 'Lac 2, Tunis', lat: 36.853, lng: 10.2735 };

const menzahStop = { stopId: 'stop-menzah', label: 'Menzah 6 — Av. Hédi Nouira', lat: 36.8475, lng: 10.1725, walkMeters: 240, walkMinutes: 3, sequence: 1 };
const lacStop = { stopId: 'stop-lac', label: 'Lac 2 — Rue du Lac Windermere', lat: 36.8505, lng: 10.2712, walkMeters: 320, walkMinutes: 4, sequence: 2 };

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    rideId: 'ride-1',
    driverUserId: 'driver-1',
    driverFullName: 'Driver A',
    driverAvatarUrl: null,
    ratingAvg: 4.8,
    tripCount: 12,
    departureAt: '2026-10-05T18:10:00.000Z',
    seatsAvailable: 3,
    contributionPerSeat: 4,
    pickupWalkMeters: 240,
    pickupWalkMinutes: 3,
    dropoffWalkMeters: 320,
    dropoffWalkMinutes: 4,
    withinWalkingDistance: true,
    routeOverlapPercent: 100,
    score: 0.8,
    reasons: [],
    clusterLabel: 'Maintenant',
    // The DRIVER's own ride endpoints.
    originLat: ride.originLat,
    originLng: ride.originLng,
    destinationLat: ride.destinationLat,
    destinationLng: ride.destinationLng,
    passengerJourney: {
      originLat: searchOrigin.lat,
      originLng: searchOrigin.lng,
      destinationLat: searchDestination.lat,
      destinationLng: searchDestination.lng,
    },
    pickupPoint: { stopId: menzahStop.stopId, label: menzahStop.label, lat: menzahStop.lat, lng: menzahStop.lng, walkMeters: 240, walkMinutes: 3 },
    dropoffPoint: { stopId: lacStop.stopId, label: lacStop.label, lat: lacStop.lat, lng: lacStop.lng, walkMeters: 320, walkMinutes: 4 },
    routePolyline: null,
    rankedStops: [menzahStop],
    rankedDropoffStops: [lacStop],
    recommendedStopId: menzahStop.stopId,
    recommendedDropoffStopId: lacStop.stopId,
    pickupViable: true,
    dropoffViable: true,
    matchType: 'route_passthrough',
    detour: null,
    pickupEtaSeconds: 600,
    dropoffEtaSeconds: 1500,
    detourRoutePolyline: null,
    ...overrides,
  };
}

const base = { selectedPickup: null, selectedDropoff: null, searchOrigin, searchDestination, ride };

describe('resolvePassengerSegmentPoints', () => {
  it("shows the passenger's own Menzah 6 -> Lac 2 segment, never Menzah 6 -> La Marsa", () => {
    const { pickup, dropoff } = resolvePassengerSegmentPoints({ ...base, candidate: candidate() });
    expect(pickup.stopId).toBe('stop-menzah');
    expect(pickup.label).toContain('Menzah 6');
    expect(dropoff.stopId).toBe('stop-lac');
    expect(dropoff.label).toContain('Lac 2');
    expect(dropoff.label).not.toBe(ride.destinationLabel);
    expect(dropoff.lat).not.toBe(ride.destinationLat);
  });

  it("falls back to the passenger's own destination, not the driver's, when no dropoff is resolved yet", () => {
    const { dropoff } = resolvePassengerSegmentPoints({ ...base, candidate: candidate({ dropoffPoint: null }) });
    expect(dropoff.label).toBe('Lac 2, Tunis');
    expect(dropoff.stopId).toBeUndefined();
  });

  it("an explicit passenger choice on the dropoff picker wins over the server's default", () => {
    const chosen = { stopId: 'stop-lac-east', label: 'Lac 2 — Est', lat: 36.853, lng: 10.274 };
    const { dropoff } = resolvePassengerSegmentPoints({ ...base, candidate: candidate(), selectedDropoff: chosen });
    expect(dropoff).toEqual(chosen);
  });

  it("a detour match uses the passenger's own searched places", () => {
    const { pickup, dropoff } = resolvePassengerSegmentPoints({
      ...base,
      candidate: candidate({ matchType: 'detour', rankedStops: [], rankedDropoffStops: [] }),
    });
    expect(pickup.label).toBe('Menzah 6, Tunis');
    expect(dropoff.label).toBe('Lac 2, Tunis');
  });

  it("uses the ride's own destination only when the server resolved the dropoff to it (stop-less ride ending near the passenger's destination)", () => {
    const { dropoff } = resolvePassengerSegmentPoints({
      ...base,
      candidate: candidate({
        rankedDropoffStops: [],
        dropoffPoint: { stopId: null, label: 'La Marsa', lat: ride.destinationLat, lng: ride.destinationLng, walkMeters: 160, walkMinutes: 2 },
      }),
    });
    expect(dropoff.label).toBe('La Marsa');
    expect(dropoff.stopId).toBeUndefined();
  });
});
