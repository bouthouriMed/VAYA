import { describe, it, expect } from 'vitest';
import { defaultStopId, rankedPosition } from '../pickupSelection';
import type { RankedStop } from '../../../state/api';

function stop(overrides: Partial<RankedStop> = {}): RankedStop {
  return {
    stopId: 'stop-1',
    label: 'Test stop',
    lat: 36.8,
    lng: 10.18,
    walkMinutes: 5,
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
