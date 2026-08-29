import { describe, it, expect } from 'vitest';
import {
  isSameJourneyRequest,
  findSameJourneySiblings,
  MAX_ACTIVE_REQUESTS_PER_JOURNEY,
  SAME_JOURNEY_TIME_WINDOW_MINUTES,
  type JourneyRequestPoint,
} from '../journey-grouping';

const TUNIS = { lat: 36.8065, lng: 10.1815 };
const SOUSSE = { lat: 35.8256, lng: 10.6369 };
const NOW = new Date('2026-09-01T10:00:00.000Z');

function makeRequest(overrides: Partial<JourneyRequestPoint> = {}): JourneyRequestPoint {
  return {
    riderId: 'rider-1',
    pickupLat: TUNIS.lat,
    pickupLng: TUNIS.lng,
    dropoffLat: SOUSSE.lat,
    dropoffLng: SOUSSE.lng,
    requestedAt: NOW,
    ...overrides,
  };
}

describe('isSameJourneyRequest — grouping key for "same journey" (M-051/052/055/056, ambiguity log A-5)', () => {
  it('two requests with identical pickup/dropoff/rider and close timing are the same journey', () => {
    const a = makeRequest();
    const b = makeRequest({ requestedAt: new Date(NOW.getTime() + 5 * 60_000) });
    expect(isSameJourneyRequest(a, b)).toBe(true);
  });

  it('a different rider is never the same journey, even with identical points/timing', () => {
    const a = makeRequest();
    const b = makeRequest({ riderId: 'rider-2' });
    expect(isSameJourneyRequest(a, b)).toBe(false);
  });

  it('pickup points further apart than the configured radius are not the same journey', () => {
    const a = makeRequest();
    const b = makeRequest({ pickupLat: TUNIS.lat + 0.1, pickupLng: TUNIS.lng }); // ~11km away
    expect(isSameJourneyRequest(a, b)).toBe(false);
  });

  it('pickup points within the configured radius still count as the same journey', () => {
    const a = makeRequest();
    // ~1m offset — well within SAME_JOURNEY_PICKUP_RADIUS_METERS.
    const b = makeRequest({ pickupLat: TUNIS.lat + 0.00001, pickupLng: TUNIS.lng });
    expect(isSameJourneyRequest(a, b)).toBe(true);
  });

  it('dropoff points further apart than the configured radius are not the same journey', () => {
    const a = makeRequest();
    const b = makeRequest({ dropoffLat: SOUSSE.lat + 0.1, dropoffLng: SOUSSE.lng });
    expect(isSameJourneyRequest(a, b)).toBe(false);
  });

  it('requests outside the shared time window are not the same journey, even with identical points', () => {
    const a = makeRequest();
    const b = makeRequest({
      requestedAt: new Date(NOW.getTime() + (SAME_JOURNEY_TIME_WINDOW_MINUTES + 1) * 60_000),
    });
    expect(isSameJourneyRequest(a, b)).toBe(false);
  });

  it('requests exactly at the time-window boundary still count as the same journey (inclusive)', () => {
    const a = makeRequest();
    const b = makeRequest({
      requestedAt: new Date(NOW.getTime() + SAME_JOURNEY_TIME_WINDOW_MINUTES * 60_000),
    });
    expect(isSameJourneyRequest(a, b)).toBe(true);
  });

  it('M-085a: an injected threshold override changes the outcome, proving it is not hardcoded', () => {
    const a = makeRequest();
    const b = makeRequest({ pickupLat: TUNIS.lat + 0.1, pickupLng: TUNIS.lng }); // ~11km away
    expect(isSameJourneyRequest(a, b)).toBe(false); // default radius rejects it
    expect(
      isSameJourneyRequest(a, b, { pickupRadiusMeters: 20_000, dropoffRadiusMeters: 500, timeWindowMinutes: 30 }),
    ).toBe(true); // a looser admin-configured radius accepts it
  });
});

describe('findSameJourneySiblings — filters a rider\'s other active requests down to the matching journey', () => {
  it('returns only the requests that are genuinely the same journey, excluding unrelated ones', () => {
    const candidate = makeRequest();
    const sameJourneySibling = makeRequest({ requestedAt: new Date(NOW.getTime() + 60_000) });
    const differentDestination = makeRequest({ dropoffLat: TUNIS.lat + 1, dropoffLng: TUNIS.lng + 1 });
    const differentRider = makeRequest({ riderId: 'rider-2' });

    const siblings = findSameJourneySiblings(candidate, [
      sameJourneySibling,
      differentDestination,
      differentRider,
    ]);

    expect(siblings).toEqual([sameJourneySibling]);
  });

  it('EDGE-grouping-1/2: a rider with MAX_ACTIVE_REQUESTS_PER_JOURNEY - 1 existing same-journey siblings has room for one more, but not beyond the cap', () => {
    const candidate = makeRequest();
    const existingSiblings = Array.from({ length: MAX_ACTIVE_REQUESTS_PER_JOURNEY - 1 }, (_, i) =>
      makeRequest({ requestedAt: new Date(NOW.getTime() + i * 1000) }),
    );
    const siblings = findSameJourneySiblings(candidate, existingSiblings);
    expect(siblings).toHaveLength(MAX_ACTIVE_REQUESTS_PER_JOURNEY - 1);
    // A caller enforcing the cap would allow this one (siblings.length < MAX)
    // and reject a request once siblings.length >= MAX — asserted here as
    // the documented contract this pure function's caller relies on.
    expect(siblings.length).toBeLessThan(MAX_ACTIVE_REQUESTS_PER_JOURNEY);
  });
});
