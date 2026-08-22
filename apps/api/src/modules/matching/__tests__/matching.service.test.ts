import { describe, it, expect } from 'vitest';
import { rankStopsByWalkDistance, isPickupViable, isDropoffViable } from '../matching.service.js';

// Pure functions, no DB/OSRM dependency — exercised the same way
// stop-candidates.service.test.ts exercises its own pure scoring/
// clustering math (docs/roadmap/phase-05-ride-engine-passenger-selection.md's
// testing requirement).

// Tunis city-center-ish origin. ~0.01 degrees latitude ≈ 1113m regardless
// of longitude, so distances below are easy to reason about by hand.
const origin = { lat: 36.8, lng: 10.18 };

function stopAtLatOffset(id: string, deg: number) {
  return { id, label: `Stop ${id}`, lat: origin.lat + deg, lng: origin.lng };
}

describe('rankStopsByWalkDistance', () => {
  it('ranks stops ascending by walk distance from the passenger origin', () => {
    const near = stopAtLatOffset('near', 0.005); // ~556m
    const mid = stopAtLatOffset('mid', 0.01); // ~1113m
    const far = stopAtLatOffset('far', 0.015); // ~1669m

    const ranked = rankStopsByWalkDistance(origin, [far, near, mid]);

    expect(ranked.map((s) => s.stopId)).toEqual(['near', 'mid', 'far']);
    expect(ranked[0]!.walkMinutes).toBeLessThan(ranked[1]!.walkMinutes);
    expect(ranked[1]!.walkMinutes).toBeLessThan(ranked[2]!.walkMinutes);
  });

  it('filters out stops beyond the given radius, reusing the tight/wide tier constants', () => {
    const inRange = stopAtLatOffset('in', 0.01); // ~1.1km
    const outOfRange = stopAtLatOffset('out', 0.2); // ~22km

    const ranked = rankStopsByWalkDistance(origin, [inRange, outOfRange], 8000);
    expect(ranked.map((s) => s.stopId)).toEqual(['in']);
  });

  it('returns an empty array when every stop is out of range (the zero-viable-stops case)', () => {
    const farAway = stopAtLatOffset('far', 0.5); // ~55km
    const ranked = rankStopsByWalkDistance(origin, [farAway], 8000);
    expect(ranked).toEqual([]);
  });

  it('returns an empty array for a ride with no stops at all', () => {
    expect(rankStopsByWalkDistance(origin, [])).toEqual([]);
  });

  it('carries the stop label/lat/lng through unchanged', () => {
    const stop = { ...stopAtLatOffset('s1', 0.005), label: 'Station Total, Av. Habib Bourguiba' };
    const [ranked] = rankStopsByWalkDistance(origin, [stop]);
    expect(ranked!.label).toBe('Station Total, Av. Habib Bourguiba');
    expect(ranked!.lat).toBe(stop.lat);
    expect(ranked!.lng).toBe(stop.lng);
  });
});

describe('isPickupViable', () => {
  it('is always viable for a legacy ride with zero route_stops', () => {
    expect(isPickupViable(0, 0)).toBe(true);
  });

  it('is viable when at least one stop ranks within range', () => {
    expect(isPickupViable(3, 1)).toBe(true);
  });

  it('is not viable when the ride has stops but none rank within range', () => {
    expect(isPickupViable(3, 0)).toBe(false);
  });
});

// Phase 13 (docs/roadmap/phase-13-search-engine.md): dropoff-side mirror of
// isPickupViable — same three cases, same rule, verified independently
// since a future change to one shouldn't silently drift the other apart.
describe('isDropoffViable', () => {
  it('is always viable for a legacy ride with zero route_stops', () => {
    expect(isDropoffViable(0, 0)).toBe(true);
  });

  it('is viable when at least one dropoff-ranked stop is within range', () => {
    expect(isDropoffViable(3, 1)).toBe(true);
  });

  it('is not viable when the ride has stops but none rank within range of the destination', () => {
    expect(isDropoffViable(3, 0)).toBe(false);
  });
});
