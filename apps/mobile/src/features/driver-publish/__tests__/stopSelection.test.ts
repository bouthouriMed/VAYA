import { describe, it, expect } from 'vitest';
import { toggleStopSelection, buildStopSelectionPayload } from '../stopSelection';
import type { RouteStop } from '../../../state/api';

function stop(overrides: Partial<RouteStop> = {}): RouteStop {
  return {
    id: 'stop-1',
    rideId: 'ride-1',
    sequence: 0,
    label: 'Test stop',
    lat: 36.8,
    lng: 10.18,
    roadSnapped: true,
    deviationMeters: 20,
    deviationSeconds: 10,
    suitabilityScore: 0.8,
    roadClass: 'secondary',
    isDriverSelected: false,
    ...overrides,
  };
}

describe('toggleStopSelection', () => {
  it('adds a stop id that is not yet selected', () => {
    const result = toggleStopSelection(new Set(), 'stop-1');
    expect(result.has('stop-1')).toBe(true);
  });

  it('removes a stop id that is already selected', () => {
    const result = toggleStopSelection(new Set(['stop-1']), 'stop-1');
    expect(result.has('stop-1')).toBe(false);
  });

  it('does not mutate the input set', () => {
    const input = new Set(['stop-1']);
    toggleStopSelection(input, 'stop-1');
    expect(input.has('stop-1')).toBe(true); // untouched
  });

  it('leaves other selected ids untouched', () => {
    const result = toggleStopSelection(new Set(['stop-1', 'stop-2']), 'stop-1');
    expect(result.has('stop-1')).toBe(false);
    expect(result.has('stop-2')).toBe(true);
  });

  it('is idempotent when toggled twice in a row', () => {
    const once = toggleStopSelection(new Set(), 'stop-1');
    const twice = toggleStopSelection(once, 'stop-1');
    expect(twice.has('stop-1')).toBe(false);
  });
});

describe('buildStopSelectionPayload', () => {
  it('marks selected candidates true and everything else false', () => {
    const candidates = [stop({ id: 'a' }), stop({ id: 'b' }), stop({ id: 'c' })];
    const selected = new Set(['b']);

    const payload = buildStopSelectionPayload(candidates, selected);

    expect(payload).toEqual([
      { stopId: 'a', isDriverSelected: false },
      { stopId: 'b', isDriverSelected: true },
      { stopId: 'c', isDriverSelected: false },
    ]);
  });

  it('produces an explicit false for a previously-selected, now-deselected stop', () => {
    // Simulates: driver selected "a", then deselected it before publishing.
    const candidates = [stop({ id: 'a', isDriverSelected: true })];
    const payload = buildStopSelectionPayload(candidates, new Set());
    expect(payload).toEqual([{ stopId: 'a', isDriverSelected: false }]);
  });

  it('returns an empty array for an empty candidate list — publishing with zero stops is valid', () => {
    expect(buildStopSelectionPayload([], new Set())).toEqual([]);
  });
});
