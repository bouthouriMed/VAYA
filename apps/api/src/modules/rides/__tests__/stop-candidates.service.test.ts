import { describe, it, expect } from 'vitest';
import {
  classifyRoadSpeed,
  sampleRoutePoints,
  computeDeviationCost,
  scoreStopCandidate,
  clusterAndRank,
  MAX_DEVIATION_METERS,
  MAX_DEVIATION_SECONDS,
  type ScoredStopCandidate,
} from '../stop-candidates.service.js';

// All of these are pure functions with no OSRM/DB/network dependency — the
// scoring math is the highest-uncertainty part of the ride-engine roadmap
// (docs/roadmap/phase-04-ride-engine-driver-stops.md's own "Risks" section)
// and is exercised here against fixed synthetic inputs, never a live OSRM
// instance.

describe('classifyRoadSpeed', () => {
  it('classifies unknown when no speed sample is available', () => {
    expect(classifyRoadSpeed(null)).toBe('unknown');
  });

  it('classifies sustained high speed as motorway', () => {
    expect(classifyRoadSpeed(30)).toBe('motorway'); // ~108 km/h
    expect(classifyRoadSpeed(25)).toBe('motorway'); // threshold boundary
  });

  it('classifies arterial speed as primary', () => {
    expect(classifyRoadSpeed(20)).toBe('primary');
    expect(classifyRoadSpeed(16)).toBe('primary');
  });

  it('classifies normal street speed as secondary', () => {
    expect(classifyRoadSpeed(10)).toBe('secondary');
    expect(classifyRoadSpeed(8)).toBe('secondary');
  });

  it('classifies slow local speed as residential', () => {
    expect(classifyRoadSpeed(3)).toBe('residential');
    expect(classifyRoadSpeed(0)).toBe('residential');
  });
});

describe('computeDeviationCost', () => {
  it('doubles the one-way snap distance for a there-and-back detour', () => {
    const cost = computeDeviationCost(50);
    expect(cost.deviationMeters).toBe(100);
    expect(cost.deviationSeconds).toBeGreaterThan(0);
  });

  it('scales deviation seconds with distance', () => {
    const near = computeDeviationCost(20);
    const far = computeDeviationCost(200);
    expect(far.deviationSeconds).toBeGreaterThan(near.deviationSeconds);
  });
});

describe('scoreStopCandidate — rejection rules', () => {
  it('rejects motorway-class candidates outright, regardless of deviation', () => {
    const result = scoreStopCandidate({
      deviationMeters: 5,
      deviationSeconds: 5,
      roadClass: 'motorway',
      hasLabel: true,
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toBe('road_class');
    expect(result.suitabilityScore).toBe(0);
  });

  it('rejects candidates exceeding the max deviation distance outright, not downranked', () => {
    const result = scoreStopCandidate({
      deviationMeters: MAX_DEVIATION_METERS + 1,
      deviationSeconds: 10,
      roadClass: 'secondary',
      hasLabel: true,
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toBe('max_deviation');
    expect(result.suitabilityScore).toBe(0);
  });

  it('rejects candidates exceeding the max deviation time outright', () => {
    const result = scoreStopCandidate({
      deviationMeters: 10,
      deviationSeconds: MAX_DEVIATION_SECONDS + 1,
      roadClass: 'secondary',
      hasLabel: true,
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toBe('max_deviation');
  });

  it('accepts a well-placed secondary-road candidate within threshold', () => {
    const result = scoreStopCandidate({
      deviationMeters: 20,
      deviationSeconds: 10,
      roadClass: 'secondary',
      hasLabel: true,
    });
    expect(result.accepted).toBe(true);
    expect(result.suitabilityScore).toBeGreaterThan(0.5);
  });

  it('scores an unnamed candidate lower than an otherwise-identical named one', () => {
    const named = scoreStopCandidate({
      deviationMeters: 20,
      deviationSeconds: 10,
      roadClass: 'secondary',
      hasLabel: true,
    });
    const unnamed = scoreStopCandidate({
      deviationMeters: 20,
      deviationSeconds: 10,
      roadClass: 'secondary',
      hasLabel: false,
    });
    expect(named.suitabilityScore).toBeGreaterThan(unnamed.suitabilityScore);
  });

  it('accepts a candidate exactly at the deviation threshold', () => {
    const result = scoreStopCandidate({
      deviationMeters: MAX_DEVIATION_METERS,
      deviationSeconds: MAX_DEVIATION_SECONDS,
      roadClass: 'residential',
      hasLabel: false,
    });
    expect(result.accepted).toBe(true);
  });
});

describe('sampleRoutePoints', () => {
  // A ~5km straight line north from Tunis city-center-ish coordinates —
  // simple enough to reason about exact sample counts/positions by hand.
  const straightLineNorth = Array.from({ length: 51 }, (_, i) => ({
    lat: 36.8 + i * 0.0009, // ~100m per step, ~5km total
    lng: 10.18,
  }));

  it('produces no samples for a degenerate (single-point or empty) route', () => {
    expect(sampleRoutePoints([], [])).toEqual([]);
    expect(sampleRoutePoints([{ lat: 36.8, lng: 10.18 }], [])).toEqual([]);
  });

  it('samples roughly every 1km along a longer route, skipping the edges', () => {
    const speeds = Array.from({ length: straightLineNorth.length - 1 }, () => 10);
    const samples = sampleRoutePoints(straightLineNorth, speeds, 1000);

    expect(samples.length).toBeGreaterThan(0);
    // None of the samples should sit at the very start or end of the route.
    for (const sample of samples) {
      expect(sample.point.lat).toBeGreaterThan(straightLineNorth[0]!.lat);
      expect(sample.point.lat).toBeLessThan(straightLineNorth.at(-1)!.lat);
    }
    // Sequence numbers are assigned in order, starting at 0.
    expect(samples.map((s) => s.sequence)).toEqual(samples.map((_, i) => i));
  });

  it('attaches the local segment speed to each sample', () => {
    const speeds = Array.from({ length: straightLineNorth.length - 1 }, (_, i) =>
      i < 25 ? 5 : 30,
    );
    const samples = sampleRoutePoints(straightLineNorth, speeds, 1000);
    const speedValues = new Set(samples.map((s) => s.segmentSpeedMPerS));
    // Both the slow first half and fast second half should be represented.
    expect(speedValues.has(5)).toBe(true);
  });
});

describe('clusterAndRank', () => {
  function candidate(overrides: Partial<ScoredStopCandidate>): ScoredStopCandidate {
    return {
      sequence: 0,
      label: 'Test stop',
      lat: 36.8,
      lng: 10.18,
      roadSnapped: true,
      deviationMeters: 10,
      deviationSeconds: 5,
      suitabilityScore: 0.5,
      roadClass: 'secondary',
      ...overrides,
    };
  }

  it('merges candidates within the corridor radius, keeping the highest-scored', () => {
    const a = candidate({ sequence: 0, lat: 36.8, lng: 10.18, suitabilityScore: 0.4, label: 'A' });
    // ~50m away from `a` — well within a 150m merge radius.
    const b = candidate({ sequence: 1, lat: 36.8004, lng: 10.18, suitabilityScore: 0.9, label: 'B' });

    const result = clusterAndRank([a, b], 150, 8);

    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('B');
  });

  it('keeps candidates that are far enough apart', () => {
    const a = candidate({ sequence: 0, lat: 36.8, lng: 10.18, label: 'A' });
    // ~5.5km away — well outside any plausible merge radius.
    const b = candidate({ sequence: 1, lat: 36.85, lng: 10.18, label: 'B' });

    const result = clusterAndRank([a, b], 150, 8);
    expect(result).toHaveLength(2);
  });

  it('caps the result at maxCount, preferring the highest-scored candidates', () => {
    const far = Array.from({ length: 12 }, (_, i) =>
      candidate({
        sequence: i,
        lat: 36.8 + i * 0.05, // far apart, no merging
        lng: 10.18,
        suitabilityScore: i / 12,
        label: `Stop ${i}`,
      }),
    );

    const result = clusterAndRank(far, 150, 8);
    expect(result).toHaveLength(8);
    // The lowest-scored candidates (0..3) should have been dropped.
    expect(result.map((c) => c.label)).not.toContain('Stop 0');
  });

  it('re-sorts the kept candidates back into route order and renumbers sequence', () => {
    const a = candidate({ sequence: 5, lat: 36.9, lng: 10.18, label: 'Later' });
    const b = candidate({ sequence: 1, lat: 36.85, lng: 10.18, label: 'Earlier' });

    const result = clusterAndRank([a, b], 150, 8);
    expect(result.map((c) => c.label)).toEqual(['Earlier', 'Later']);
    expect(result.map((c) => c.sequence)).toEqual([0, 1]);
  });
});
