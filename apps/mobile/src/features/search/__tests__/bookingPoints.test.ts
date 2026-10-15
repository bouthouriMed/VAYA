import { describe, it, expect } from 'vitest';
import { buildBookingPoints } from '../bookingPoints';
import type { MatchCandidate } from '../../../state/api';

// Driver Ksar Said -> El Mourouj; passenger Sidi Hassine -> El Mourouj.
const searchOrigin = { label: 'Sidi Hassine', lat: 36.766, lng: 10.104 };
const searchDestination = { label: 'El Mourouj', lat: 36.7305, lng: 10.2095 };
const RIDE_DESTINATION = { lat: 36.73, lng: 10.21 };

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    matchType: 'route_passthrough',
    destinationLat: RIDE_DESTINATION.lat,
    destinationLng: RIDE_DESTINATION.lng,
    pickupPoint: { stopId: null, label: null, lat: 36.7655, lng: 10.1198, walkMeters: 1800, walkMinutes: 22 },
    dropoffPoint: { stopId: null, label: null, lat: 36.7301, lng: 10.2096, walkMeters: 60, walkMinutes: 1 },
    ...overrides,
  } as MatchCandidate;
}

describe('buildBookingPoints — the request carries the pair the server chose', () => {
  it('books an on-route pickup and drop-off as the exact points, labelled with the passenger places', () => {
    expect(buildBookingPoints({ candidate: candidate(), searchOrigin, searchDestination })).toEqual({
      pickup: { label: 'Sidi Hassine', lat: 36.7655, lng: 10.1198 },
      requestedPickup: searchOrigin,
      dropoff: { label: 'El Mourouj', lat: 36.7301, lng: 10.2096 },
    });
  });

  it('names the meeting point VAYA chose, so the server can learn which places get used', () => {
    const points = buildBookingPoints({
      candidate: candidate({
        pickupPoint: { stopId: null, label: 'Station Total', lat: 36.7652, lng: 10.1207, walkMeters: 900, walkMinutes: 11, meetingPointId: 'mp-1', placeKind: 'fuel_station' },
      }),
      searchOrigin,
      searchDestination,
    });
    expect(points).toMatchObject({
      pickup: { label: 'Station Total', lat: 36.7652, lng: 10.1207 },
      pickupMeetingPointId: 'mp-1',
    });
  });

  it('books driver stops by id, with the passenger places for server-side re-validation', () => {
    const points = buildBookingPoints({
      candidate: candidate({
        pickupPoint: { stopId: 'stop-a', label: 'Sidi Hassine — X20', lat: 36.765, lng: 10.12, walkMeters: 900, walkMinutes: 11 },
        dropoffPoint: { stopId: 'stop-b', label: 'Mourouj 3', lat: 36.74, lng: 10.2, walkMeters: 900, walkMinutes: 11 },
      }),
      searchOrigin,
      searchDestination,
    });
    expect(points).toEqual({
      pickupStopId: 'stop-a',
      requestedPickup: searchOrigin,
      dropoffStopId: 'stop-b',
      requestedDropoff: searchDestination,
    });
  });

  it("sends no drop-off when the server resolved it to the ride's own destination", () => {
    const points = buildBookingPoints({
      candidate: candidate({
        dropoffPoint: { stopId: null, label: 'El Mourouj', ...RIDE_DESTINATION, walkMeters: 60, walkMinutes: 1 },
      }),
      searchOrigin,
      searchDestination,
    });
    expect(points).not.toHaveProperty('dropoff');
    expect(points).not.toHaveProperty('dropoffStopId');
  });

  it('a detour match books the passenger own places', () => {
    expect(buildBookingPoints({ candidate: candidate({ matchType: 'detour' }), searchOrigin, searchDestination })).toEqual({
      pickup: searchOrigin,
      dropoff: searchDestination,
    });
  });

  it('cannot build a request without a resolved pickup', () => {
    expect(buildBookingPoints({ candidate: candidate({ pickupPoint: null }), searchOrigin, searchDestination })).toBeNull();
  });
});
