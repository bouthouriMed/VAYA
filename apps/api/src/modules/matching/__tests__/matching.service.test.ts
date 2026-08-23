import { describe, it, expect } from 'vitest';
import {
  rankStopsByWalkDistance,
  isPickupViable,
  isDropoffViable,
  detourAllowanceSec,
  polylineLengthMeters,
} from '../matching.service.js';

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

// Detour-match tier (Google/PostGIS location spec §7) — pure math only, no
// DB/OSRM/Google dependency. The routing-API-calling half of this tier
// (scoreDetourCandidates itself) needs a real Postgres+PostGIS+routing
// provider to exercise end-to-end and isn't covered here — see the
// accompanying implementation report for what remains to verify with real
// infrastructure.
describe('detourAllowanceSec', () => {
  it('scales with the ratio for a mid-length trip, within the floor/ceiling', () => {
    // 20-minute baseline * 0.25 ratio = 5 minutes, comfortably between the
    // 3-minute floor and 12-minute ceiling.
    expect(detourAllowanceSec(20 * 60)).toBeCloseTo(5 * 60, 0);
  });

  it('clamps to the floor for a very short trip', () => {
    // A 2-minute trip's 25% ratio allowance (30s) is below the 3-minute
    // floor — the floor wins, so a short hop isn't punished with an
    // unusably tiny detour budget.
    expect(detourAllowanceSec(2 * 60)).toBe(3 * 60);
  });

  it('clamps to the ceiling for a very long trip', () => {
    // A 3-hour intercity trip's 25% ratio allowance (45 min) is far above
    // the 12-minute ceiling — the ceiling wins, so a long trip can't be
    // asked to absorb an unreasonably large absolute detour.
    expect(detourAllowanceSec(3 * 3600)).toBe(12 * 60);
  });

  it('is monotonically non-decreasing in baseline duration inside the ratio-dominant range', () => {
    const shortAllowance = detourAllowanceSec(15 * 60);
    const longerAllowance = detourAllowanceSec(30 * 60);
    expect(longerAllowance).toBeGreaterThanOrEqual(shortAllowance);
  });
});

describe('polylineLengthMeters', () => {
  it('sums consecutive-point distances along a route', () => {
    // Three points ~0.01 lat apart each (~1113m per step, same
    // easy-to-reason-about spacing the file's other tests already use).
    const points = [
      { lat: 36.8, lng: 10.18 },
      { lat: 36.81, lng: 10.18 },
      { lat: 36.82, lng: 10.18 },
    ];
    const length = polylineLengthMeters(points);
    expect(length).toBeGreaterThan(2000);
    expect(length).toBeLessThan(2300);
  });

  it('returns 0 for a degenerate single-point or empty route', () => {
    expect(polylineLengthMeters([{ lat: 36.8, lng: 10.18 }])).toBe(0);
    expect(polylineLengthMeters([])).toBe(0);
  });
});
