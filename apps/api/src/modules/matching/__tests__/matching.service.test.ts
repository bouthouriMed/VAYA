import { describe, it, expect } from 'vitest';
import {
  rankStopsByWalkDistance,
  isPickupViable,
  isDropoffViable,
  detourAllowanceSec,
  polylineLengthMeters,
  deriveMatchingThresholds,
  computeMatchBand,
  rankMatchCandidates,
  mergeCandidatesByRide,
  type MatchCandidate,
} from '../matching.service.js';
import { getMatchingThresholds } from '@vaya/domain';

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

// Matching-engine architecture plan §G / §A ("trip-profile-aware matching
// thresholds", the first phase of that plan) — deriveMatchingThresholds is
// searchRides's only entry point into packages/domain's profile-scaled
// thresholds table, so this locks in exactly which real-world trip lengths
// land in which bucket, from the caller's actual input shape (lat/lng/when),
// not just classifyTripProfile's own already-tested distance-only contract.
describe('deriveMatchingThresholds', () => {
  const when = new Date('2026-09-01T08:00:00Z');

  // 0.01 degrees latitude ~= 1113m regardless of longitude — same
  // easy-to-reason-about spacing this file's other tests already use.
  function inputAtLatOffset(deg: number) {
    return { originLat: origin.lat, originLng: origin.lng, destinationLat: origin.lat + deg, destinationLng: origin.lng, when };
  }

  it('derives commute-profile thresholds for a short (~3km) requested trip', () => {
    const thresholds = deriveMatchingThresholds(inputAtLatOffset(0.027));
    expect(thresholds).toEqual(getMatchingThresholds('commute'));
  });

  it('derives urban-profile thresholds for a mid-length (~30km) requested trip', () => {
    const thresholds = deriveMatchingThresholds(inputAtLatOffset(0.27));
    expect(thresholds).toEqual(getMatchingThresholds('urban'));
  });

  it('derives intercity-profile thresholds for a long (~120km) requested trip', () => {
    const thresholds = deriveMatchingThresholds(inputAtLatOffset(1.08));
    expect(thresholds).toEqual(getMatchingThresholds('intercity'));
  });

  it('is symmetric — swapping origin and destination derives the same thresholds', () => {
    const forward = inputAtLatOffset(0.27);
    const reversed = {
      originLat: forward.destinationLat,
      originLng: forward.destinationLng,
      destinationLat: forward.originLat,
      destinationLng: forward.originLng,
      when,
    };
    expect(deriveMatchingThresholds(reversed)).toEqual(deriveMatchingThresholds(forward));
  });

  it('never throws for an identical origin/destination (a degenerate zero-distance request)', () => {
    const thresholds = deriveMatchingThresholds(inputAtLatOffset(0));
    expect(thresholds).toEqual(getMatchingThresholds('commute'));
  });
});

// Matching-engine architecture plan §D / §Decisions #3 (Phase B) — the
// unified, banded, tie-tolerant passenger-oriented ranking that replaces
// "whichever tier finds a candidate first wins", built directly on top of
// each product decision: bands over precise scores, ties surfaced together
// rather than forced apart, and a "standout" flag that only ever fires when
// genuinely warranted.
function makeCandidate(overrides: Partial<MatchCandidate> & { rideId: string; score: number }): MatchCandidate {
  return {
    driverUserId: `driver-${overrides.rideId}`,
    driverFullName: 'Test Driver',
    driverAvatarUrl: null,
    ratingAvg: 4.5,
    tripCount: 10,
    departureAt: new Date('2026-09-01T08:00:00Z'),
    seatsAvailable: 3,
    contributionPerSeat: 10,
    pickupWalkMinutes: 2,
    dropoffWalkMinutes: 2,
    routeOverlapPercent: 50,
    reasons: [],
    clusterLabel: 'Maintenant',
    originLat: 36.8,
    originLng: 10.18,
    destinationLat: 36.85,
    destinationLng: 10.2,
    routePolyline: null,
    rankedStops: [],
    rankedDropoffStops: [],
    pickupViable: true,
    dropoffViable: true,
    matchType: 'endpoint',
    detour: null,
    ...overrides,
  };
}

describe('computeMatchBand', () => {
  it('classifies into excellent/good/usable at the documented thresholds', () => {
    expect(computeMatchBand(0.9)).toBe('excellent');
    expect(computeMatchBand(0.72)).toBe('excellent');
    expect(computeMatchBand(0.71)).toBe('good');
    expect(computeMatchBand(0.45)).toBe('good');
    expect(computeMatchBand(0.44)).toBe('usable');
    expect(computeMatchBand(0)).toBe('usable');
  });
});

describe('rankMatchCandidates', () => {
  const when = new Date('2026-09-01T08:00:00Z');
  const input = { originLat: 36.8, originLng: 10.18, destinationLat: 36.85, destinationLng: 10.2, when };

  it('sorts a clearly-better candidate first, and flags it as the standout', () => {
    const mediocre = makeCandidate({ rideId: 'mediocre', score: 0.5 });
    const excellent = makeCandidate({ rideId: 'excellent', score: 0.9, departureAt: when });
    const { ranked, standoutRideId } = rankMatchCandidates([mediocre, excellent], input);
    expect(ranked.map((c) => c.rideId)).toEqual(['excellent', 'mediocre']);
    expect(standoutRideId).toBe('excellent');
  });

  it('does NOT crown a standout when two candidates share the top band — both surface, order broken only by departure-time proximity (§Decisions #3: no forced perfect ordering)', () => {
    const closer = makeCandidate({
      rideId: 'closer',
      score: 0.8,
      departureAt: new Date(when.getTime() + 5 * 60_000),
    });
    const farther = makeCandidate({
      rideId: 'farther',
      score: 0.82, // Higher raw score, but same band as `closer` — must NOT win on that alone.
      departureAt: new Date(when.getTime() + 60 * 60_000),
    });
    const { ranked, standoutRideId } = rankMatchCandidates([farther, closer], input);
    expect(standoutRideId).toBeNull();
    expect(ranked.map((c) => c.rideId)).toEqual(['closer', 'farther']);
  });

  it('the flagship case: a mediocre "exact" endpoint match never buries an excellent route_passthrough match', () => {
    const mediocreExact = makeCandidate({
      rideId: 'mediocre-exact',
      score: 0.4,
      matchType: 'endpoint',
    });
    const excellentPassthrough = makeCandidate({
      rideId: 'excellent-passthrough',
      score: 0.85,
      matchType: 'route_passthrough',
    });
    const { ranked, standoutRideId } = rankMatchCandidates([mediocreExact, excellentPassthrough], input);
    expect(ranked[0]!.rideId).toBe('excellent-passthrough');
    expect(standoutRideId).toBe('excellent-passthrough');
  });

  it('returns an empty ranking and no standout for an empty input', () => {
    const { ranked, standoutRideId } = rankMatchCandidates([], input);
    expect(ranked).toEqual([]);
    expect(standoutRideId).toBeNull();
  });
});

describe('mergeCandidatesByRide', () => {
  it('deduplicates by rideId, keeping the higher-scored representation', () => {
    const asEndpoint = makeCandidate({ rideId: 'ride-1', score: 0.4, matchType: 'endpoint' });
    const asPassthrough = makeCandidate({ rideId: 'ride-1', score: 0.7, matchType: 'route_passthrough' });
    const merged = mergeCandidatesByRide([asEndpoint], [asPassthrough]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.matchType).toBe('route_passthrough');
    expect(merged[0]!.score).toBe(0.7);
  });

  it('keeps every candidate from every list when rideIds are distinct', () => {
    const a = makeCandidate({ rideId: 'ride-a', score: 0.5 });
    const b = makeCandidate({ rideId: 'ride-b', score: 0.6 });
    const merged = mergeCandidatesByRide([a], [b]);
    expect(merged.map((c) => c.rideId).sort()).toEqual(['ride-a', 'ride-b']);
  });

  it('handles any number of lists, including empty ones', () => {
    const a = makeCandidate({ rideId: 'ride-a', score: 0.5 });
    expect(mergeCandidatesByRide([], [a], [])).toEqual([a]);
    expect(mergeCandidatesByRide()).toEqual([]);
  });
});
