import { describe, it, expect } from 'vitest';
import {
  rankStopsByWalkDistance,
  resolvePassengerSegment,
  pickDirectionalPair,
  resolvePassengerSegmentWithinReach,
  isPickupViable,
  isDropoffViable,
  deriveMatchingThresholds,
  computeMatchBand,
  rankMatchCandidates,
  mergeCandidatesByRide,
  type MatchCandidate,
} from '../matching.service.js';
import { polylineLengthMeters } from '../../../lib/polyline.js';
import {
  detourAllowanceSec,
  getMatchingThresholds,
  getPassengerAccessCaps,
  getPassengerExtendedReachCaps,
  STREET_DISTANCE_FACTOR,
  WALK_SPEED_M_PER_MIN,
} from '@vaya/domain';
import { haversineDistanceMeters } from '../../../lib/geo.js';

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

  it('reports an honest street walk (straight line x STREET_DISTANCE_FACTOR), not the straight line', () => {
    const stop = stopAtLatOffset('s', 0.01);
    const straightM = haversineDistanceMeters(origin, stop);
    const [ranked] = rankStopsByWalkDistance(origin, [stop]);
    expect(ranked!.walkMeters).toBeCloseTo(straightM * STREET_DISTANCE_FACTOR, 6);
    expect(ranked!.walkMinutes).toBeCloseTo((straightM * STREET_DISTANCE_FACTOR) / WALK_SPEED_M_PER_MIN, 6);
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
    pickupWalkMeters: 160,
    pickupWalkMinutes: 2,
    dropoffWalkMeters: 160,
    dropoffWalkMinutes: 2,
    withinWalkingDistance: true,
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

  it('always ranks rides within walking distance first, even above a higher-scored ride further away', () => {
    const farButGreat = makeCandidate({ rideId: 'far', score: 0.95, withinWalkingDistance: false });
    const nearButOk = makeCandidate({ rideId: 'near', score: 0.5, withinWalkingDistance: true });
    const nearAndGood = makeCandidate({ rideId: 'near-good', score: 0.8, withinWalkingDistance: true });
    const { ranked, standoutRideId } = rankMatchCandidates([farButGreat, nearButOk, nearAndGood], input);
    expect(ranked.map((c) => c.rideId)).toEqual(['near-good', 'near', 'far']);
    expect(standoutRideId).toBe('near-good');
  });

  it('orders rides further away among themselves by quality, then departure time', () => {
    const farOk = makeCandidate({ rideId: 'far-ok', score: 0.5, withinWalkingDistance: false });
    const farGood = makeCandidate({ rideId: 'far-good', score: 0.9, withinWalkingDistance: false });
    const { ranked } = rankMatchCandidates([farOk, farGood], input);
    expect(ranked.map((c) => c.rideId)).toEqual(['far-good', 'far-ok']);
  });

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
  it('keeps the walkable representation of a ride over a higher-scored one further away', () => {
    const far = makeCandidate({ rideId: 'ride-1', score: 0.9, withinWalkingDistance: false });
    const near = makeCandidate({ rideId: 'ride-1', score: 0.4, withinWalkingDistance: true });
    expect(mergeCandidatesByRide([far], [near])[0]!.withinWalkingDistance).toBe(true);
  });

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

// ---------------------------------------------------------------------------
// Passenger journey as a sub-segment of the driver's route (reported bug:
// driver Cité Tahrir -> La Marsa at 19:10, passenger Menzah 6 -> Lac 2 at
// 19:20 was shown "Menzah 6 -> La Marsa" — the driver's destination standing
// in for the passenger's). Real-ish Tunis coordinates; the driver's route
// runs Cité Tahrir -> Menzah 6 -> Lac 2 -> La Marsa.
// ---------------------------------------------------------------------------
const CITE_TAHRIR = { lat: 36.826, lng: 10.14 };
const MENZAH_6 = { lat: 36.848, lng: 10.172 };
const LAC_2 = { lat: 36.851, lng: 10.272 };
const LA_MARSA = { lat: 36.878, lng: 10.324 };
const DRIVER_ROUTE = [CITE_TAHRIR, MENZAH_6, LAC_2, LA_MARSA];

function routeStop(id: string, label: string, point: { lat: number; lng: number }, sequence: number) {
  return { id, label, lat: point.lat, lng: point.lng, sequence, suitabilityScore: 0.8, deviationMeters: 50 };
}

// Driver-selected stops along the corridor, in route order.
const STOP_TAHRIR = routeStop('stop-tahrir', 'Cité Tahrir — Station', CITE_TAHRIR, 0);
const STOP_MENZAH = routeStop('stop-menzah', 'Menzah 6 — Av. Hédi Nouira', { lat: 36.8475, lng: 10.1725 }, 1);
const STOP_LAC = routeStop('stop-lac', 'Lac 2 — Rue du Lac Windermere', { lat: 36.8505, lng: 10.2712 }, 2);
const STOP_MARSA = routeStop('stop-marsa', 'La Marsa — Centre', LA_MARSA, 3);

// Passenger points slightly off the driver's exact route (~150-300m).
const PASSENGER_ORIGIN = { lat: 36.8495, lng: 10.1735 }; // Menzah 6
const PASSENGER_DESTINATION = { lat: 36.853, lng: 10.2735 }; // Lac 2

// City-trip walk caps (the trip is ~9km straight-line, a 'commute') — a
// 15-minute walk at most; see passengerWalkCaps in matching.service.ts.
const cityCaps = getPassengerAccessCaps('commute');
const baseParams = {
  passengerOrigin: PASSENGER_ORIGIN,
  passengerDestination: PASSENGER_DESTINATION,
  routePoints: DRIVER_ROUTE,
  maxPickupWalkM: cityCaps.pickupM,
  maxDropoffWalkM: cityCaps.dropoffM,
  maxDeviationM: 3000,
};

describe('resolvePassengerSegment — the passenger journey is a sub-segment of the driver route', () => {
  it('acceptance: Menzah 6 -> Lac 2 on a Cité Tahrir -> La Marsa ride resolves to a Menzah 6 pickup and a Lac 2 dropoff, never La Marsa', () => {
    const segment = resolvePassengerSegment({
      ...baseParams,
      rideStops: [STOP_TAHRIR, STOP_MENZAH, STOP_LAC, STOP_MARSA],
    });

    expect(segment.pickup?.stopId).toBe('stop-menzah');
    expect(segment.dropoff?.stopId).toBe('stop-lac');
    expect(segment.dropoff?.label).toContain('Lac 2');
    expect(segment.dropoff?.label).not.toContain('La Marsa');
    expect(segment.recommendedStopId).toBe('stop-menzah');
    expect(segment.recommendedDropoffStopId).toBe('stop-lac');
    // Minimal walking: a few minutes each way (honest street estimate),
    // well under the 15-minute city cap.
    expect(segment.pickup!.walkMinutes).toBeLessThan(8);
    expect(segment.dropoff!.walkMinutes).toBeLessThan(8);
    // Pickup strictly before dropoff along the driver's route, both
    // genuinely mid-route (the driver's own endpoints are 0 and 1).
    expect(segment.pickupRouteFraction).toBeGreaterThan(0);
    expect(segment.pickupRouteFraction).toBeLessThan(segment.dropoffRouteFraction);
    expect(segment.dropoffRouteFraction).toBeLessThan(1);
  });

  it("never offers the driver's destination as the passenger's dropoff even when the tier would allow it within a wide radius, if a stop near the passenger's destination exists", () => {
    // The endpoint tier offers the ride's own destination within its WIDE
    // dropoff radius (10km here — La Marsa is ~5.5km from Lac 2). The
    // walkable Lac 2 stop must still win.
    const segment = resolvePassengerSegment({
      ...baseParams,
      rideStops: [STOP_TAHRIR, STOP_MENZAH, STOP_LAC, STOP_MARSA],
      rideDestination: { label: 'La Marsa', ...LA_MARSA, maxWalkM: 10_000 },
    });
    expect(segment.dropoff?.stopId).toBe('stop-lac');
    expect(segment.dropoff?.label).not.toBe('La Marsa');
  });

  it("rejects an excessive walk: a ride whose only dropoff near the passenger's side is at the driver's destination (La Marsa) is not a Lac 2 match", () => {
    // No stop at Lac 2 — the old 8km "walkable" cutoff accepted the La
    // Marsa stop (~5.5km away) as the passenger's dropoff.
    const segment = resolvePassengerSegment({
      ...baseParams,
      rideStops: [STOP_TAHRIR, STOP_MENZAH, STOP_MARSA],
    });
    expect(segment.dropoff).toBeNull();
    expect(segment.rankedDropoffStops).toEqual([]);
  });

  it('rejects a reversed journey: Lac 2 -> Menzah 6 against a driver heading Cité Tahrir -> La Marsa', () => {
    const segment = resolvePassengerSegment({
      ...baseParams,
      passengerOrigin: PASSENGER_DESTINATION,
      passengerDestination: PASSENGER_ORIGIN,
      rideStops: [STOP_TAHRIR, STOP_MENZAH, STOP_LAC, STOP_MARSA],
    });
    expect(segment.pickup).toBeNull();
    expect(segment.dropoff).toBeNull();
  });

  it('with several pickup and dropoff options, keeps every offered dropoff after a reachable pickup and pairs the best ones in route order', () => {
    const menzahEarly = routeStop('menzah-early', 'Menzah 6 — Nord', { lat: 36.8485, lng: 10.171 }, 1);
    const menzahLate = routeStop('menzah-late', 'Menzah 6 — Est', { lat: 36.849, lng: 10.175 }, 2);
    const lacEarly = routeStop('lac-early', 'Lac 2 — Ouest', { lat: 36.8515, lng: 10.27 }, 3);
    const lacLate = routeStop('lac-late', 'Lac 2 — Est', { lat: 36.853, lng: 10.274 }, 4);
    const segment = resolvePassengerSegment({
      ...baseParams,
      rideStops: [STOP_TAHRIR, menzahEarly, menzahLate, lacEarly, lacLate, { ...STOP_MARSA, sequence: 5 }],
    });

    expect(['menzah-early', 'menzah-late']).toContain(segment.pickup?.stopId);
    expect(['lac-early', 'lac-late']).toContain(segment.dropoff?.stopId);
    expect(segment.rankedStops.map((s) => s.stopId).sort()).toEqual(['menzah-early', 'menzah-late']);
    expect(segment.rankedDropoffStops.map((s) => s.stopId).sort()).toEqual(['lac-early', 'lac-late']);
    // Every ranked stop carries its route position so a client can keep a
    // chosen dropoff after a chosen pickup.
    expect(segment.rankedDropoffStops.every((s) => s.sequence !== null && s.sequence > 1)).toBe(true);
  });

  it('never pairs a dropoff stop that comes before the pickup stop on the route', () => {
    // Two stops both walkable from each end of a very short trip: the one
    // nearest the destination sits BEFORE the one nearest the origin.
    const a = routeStop('a', 'A', { lat: 36.8476, lng: 10.1722 }, 1);
    const b = routeStop('b', 'B', { lat: 36.8478, lng: 10.1745 }, 2);
    const segment = resolvePassengerSegment({
      ...baseParams,
      passengerOrigin: { lat: 36.8479, lng: 10.1748 }, // next to B (seq 2)
      passengerDestination: { lat: 36.8475, lng: 10.1719 }, // next to A (seq 1)
      routePoints: DRIVER_ROUTE,
      rideStops: [a, b],
    });
    // Closest-by-foot would be B -> A (backwards); the only direction-valid
    // pair is A -> B.
    expect(segment.pickup?.stopId).toBe('a');
    expect(segment.dropoff?.stopId).toBe('b');
    expect(segment.rankedDropoffStops.some((s) => s.stopId === 'a')).toBe(false);
  });

  it("resolves a legacy stop-less ride's own endpoints only when they are themselves within reach of the passenger's points", () => {
    const nearOrigin = { lat: CITE_TAHRIR.lat + 0.002, lng: CITE_TAHRIR.lng };
    const nearDestination = { lat: LA_MARSA.lat + 0.002, lng: LA_MARSA.lng };
    const segment = resolvePassengerSegment({
      ...baseParams,
      passengerOrigin: nearOrigin,
      passengerDestination: nearDestination,
      rideStops: [],
      rideOrigin: { label: 'Cité Tahrir', ...CITE_TAHRIR, maxWalkM: 4000 },
      rideDestination: { label: 'La Marsa', ...LA_MARSA, maxWalkM: 5000 },
    });
    expect(segment.pickup).toMatchObject({ stopId: null, label: 'Cité Tahrir' });
    expect(segment.dropoff).toMatchObject({ stopId: null, label: 'La Marsa' });
    expect(segment.pickupRouteFraction).toBe(0);
    expect(segment.dropoffRouteFraction).toBe(1);
  });

  it("never offers a stop-less city ride whose own origin is a 40-minute walk away (no wide endpoint fallback on a city trip)", () => {
    // The ride starts ~2.4km (straight line) from the passenger: inside the
    // old 4-8km endpoint radius, so it used to show as a ~30-40 min walk.
    const passengerOrigin = { lat: CITE_TAHRIR.lat + 0.022, lng: CITE_TAHRIR.lng };
    const segment = resolvePassengerSegment({
      ...baseParams,
      passengerOrigin,
      passengerDestination: { lat: LA_MARSA.lat + 0.002, lng: LA_MARSA.lng },
      rideStops: [],
      rideOrigin: { label: 'Cité Tahrir', ...CITE_TAHRIR, maxWalkM: cityCaps.pickupM },
      rideDestination: { label: 'La Marsa', ...LA_MARSA, maxWalkM: cityCaps.dropoffM },
    });
    expect(segment.pickup).toBeNull();
  });
});

describe('resolvePassengerSegmentWithinReach — walkable first, a bit further only when needed', () => {
  const reach = {
    profile: 'commute' as const,
    walk: getPassengerAccessCaps('commute'),
    extended: getPassengerExtendedReachCaps('commute'),
  };
  const params = {
    passengerOrigin: baseParams.passengerOrigin,
    passengerDestination: baseParams.passengerDestination,
    routePoints: baseParams.routePoints,
    maxDeviationM: baseParams.maxDeviationM,
  };

  it('prefers a walkable pair and flags it within walking distance', () => {
    const { segment, withinWalkingDistance } = resolvePassengerSegmentWithinReach(
      { ...params, rideStops: [STOP_TAHRIR, STOP_MENZAH, STOP_LAC, STOP_MARSA] },
      reach,
    );
    expect(segment.pickup?.stopId).toBe('stop-menzah');
    expect(segment.dropoff?.stopId).toBe('stop-lac');
    expect(withinWalkingDistance).toBe(true);
  });

  it('falls back to a stop a bit further away (~2 km), flagged as not within walking distance', () => {
    // The only Lac-side stop sits ~2 km from the passenger's destination.
    const lacFar = routeStop('lac-far', 'Lac 1', { lat: 36.835, lng: 10.262 }, 2);
    const { segment, withinWalkingDistance } = resolvePassengerSegmentWithinReach(
      { ...params, rideStops: [STOP_TAHRIR, STOP_MENZAH, lacFar, STOP_MARSA] },
      reach,
    );
    expect(segment.dropoff?.stopId).toBe('lac-far');
    expect(segment.dropoff!.walkMinutes).toBeGreaterThan(20);
    expect(withinWalkingDistance).toBe(false);
  });

  it('still never offers a stop beyond the extended reach (La Marsa, ~5.5 km from Lac 2)', () => {
    const { segment } = resolvePassengerSegmentWithinReach(
      { ...params, rideStops: [STOP_TAHRIR, STOP_MENZAH, STOP_MARSA] },
      reach,
    );
    expect(segment.dropoff).toBeNull();
  });
});

describe('pickDirectionalPair', () => {
  const opt = (stopId: string, sequence: number) => ({
    stopId,
    label: stopId,
    lat: 0,
    lng: 0,
    walkMeters: 80,
    walkMinutes: 1,
    sequence,
  });

  it('pairs the preferred pickup with the first preferred dropoff strictly after it', () => {
    expect(pickDirectionalPair([opt('p', 1)], [opt('d0', 0), opt('d2', 2)])).toEqual({
      pickup: opt('p', 1),
      dropoff: opt('d2', 2),
    });
  });

  it('falls back to the next pickup when the preferred one has nothing after it', () => {
    const pair = pickDirectionalPair([opt('late', 5), opt('early', 1)], [opt('d', 3)]);
    expect(pair?.pickup.stopId).toBe('early');
  });

  it('returns null when every dropoff precedes every pickup (reversed direction)', () => {
    expect(pickDirectionalPair([opt('p', 3)], [opt('d', 1)])).toBeNull();
  });
});
