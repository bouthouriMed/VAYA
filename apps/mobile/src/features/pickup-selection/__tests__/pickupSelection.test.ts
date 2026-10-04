import { describe, it, expect } from 'vitest';
import { defaultStopId, dropoffStopsAfterPickup, rankedPosition } from '../pickupSelection';
import type { RankedStop } from '../../../state/api';

function stop(overrides: Partial<RankedStop> = {}): RankedStop {
  return {
    stopId: 'stop-1',
    label: 'Test stop',
    lat: 36.8,
    lng: 10.18,
    walkMeters: 400,
    walkMinutes: 5,
    sequence: null,
    ...overrides,
  };
}

describe('defaultStopId', () => {
  it('picks the first (closest-ranked) stop', () => {
    const stops = [stop({ stopId: 'a' }), stop({ stopId: 'b' }), stop({ stopId: 'c' })];
    expect(defaultStopId(stops)).toBe('a');
  });

  it('returns null for an empty ranked list (zero-viable-stops case)', () => {
    expect(defaultStopId([])).toBeNull();
  });

  it("prefers the server's recommended stop when it is offered", () => {
    const stops = [stop({ stopId: 'a' }), stop({ stopId: 'b' })];
    expect(defaultStopId(stops, 'b')).toBe('b');
  });

  it('ignores a recommendation that is not among the offered stops', () => {
    expect(defaultStopId([stop({ stopId: 'a' })], 'gone')).toBe('a');
  });
});

describe('dropoffStopsAfterPickup', () => {
  const dropoffs = [stop({ stopId: 'early', sequence: 1 }), stop({ stopId: 'late', sequence: 4 })];

  it('keeps only dropoff stops after the chosen pickup along the driver route', () => {
    expect(dropoffStopsAfterPickup(dropoffs, 2).map((s) => s.stopId)).toEqual(['late']);
  });

  it('keeps every stop when no pickup position is known', () => {
    expect(dropoffStopsAfterPickup(dropoffs, undefined)).toHaveLength(2);
  });
});

describe('rankedPosition', () => {
  it('returns the 0-based index of a stop in its ranked list', () => {
    const stops = [stop({ stopId: 'a' }), stop({ stopId: 'b' }), stop({ stopId: 'c' })];
    expect(rankedPosition(stops, 'a')).toBe(0);
    expect(rankedPosition(stops, 'b')).toBe(1);
    expect(rankedPosition(stops, 'c')).toBe(2);
  });

  it('returns -1 for a stop id not present in the list', () => {
    const stops = [stop({ stopId: 'a' })];
    expect(rankedPosition(stops, 'missing')).toBe(-1);
  });
});
