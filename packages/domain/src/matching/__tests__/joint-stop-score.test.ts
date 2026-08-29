import { describe, it, expect } from 'vitest';
import { computeJointStopScore, rankStopsByJointOptimum } from '../joint-stop-score';

describe('computeJointStopScore', () => {
  it('scores a stop with zero walk distance, perfect suitability, and zero deviation at (close to) 1', () => {
    const score = computeJointStopScore({
      walkDistanceMeters: 0,
      maxWalkDistanceMeters: 1000,
      suitabilityScore: 1,
      deviationMeters: 0,
      maxDeviationMeters: 300,
    });
    expect(score).toBeCloseTo(1, 5);
  });

  it('scores a stop at the walk/deviation ceiling with zero suitability at (close to) 0', () => {
    const score = computeJointStopScore({
      walkDistanceMeters: 1000,
      maxWalkDistanceMeters: 1000,
      suitabilityScore: 0,
      deviationMeters: 300,
      maxDeviationMeters: 300,
    });
    expect(score).toBeCloseTo(0, 5);
  });

  it('is monotonically worse as walk distance increases, all else equal', () => {
    const near = computeJointStopScore({
      walkDistanceMeters: 100,
      maxWalkDistanceMeters: 1000,
      suitabilityScore: 0.8,
      deviationMeters: 100,
      maxDeviationMeters: 300,
    });
    const far = computeJointStopScore({
      walkDistanceMeters: 800,
      maxWalkDistanceMeters: 1000,
      suitabilityScore: 0.8,
      deviationMeters: 100,
      maxDeviationMeters: 300,
    });
    expect(near).toBeGreaterThan(far);
  });

  it('is monotonically worse as the driver-side deviation/suitability degrade, all else equal', () => {
    const goodDriverFit = computeJointStopScore({
      walkDistanceMeters: 200,
      maxWalkDistanceMeters: 1000,
      suitabilityScore: 0.9,
      deviationMeters: 20,
      maxDeviationMeters: 300,
    });
    const poorDriverFit = computeJointStopScore({
      walkDistanceMeters: 200,
      maxWalkDistanceMeters: 1000,
      suitabilityScore: 0.2,
      deviationMeters: 280,
      maxDeviationMeters: 300,
    });
    expect(goodDriverFit).toBeGreaterThan(poorDriverFit);
  });
});

describe('rankStopsByJointOptimum', () => {
  it('M-039: a genuinely joint optimum — the closest-by-foot stop does not always win when its driver-side cost is much worse', () => {
    // "closer" is 50m from the passenger but a poor road fit for the
    // driver (low suitability, near the deviation ceiling); "slightly
    // further" is 250m away but an excellent, near-zero-deviation stop.
    // A walk-distance-only ranking (the pre-M-039 behavior) would always
    // put "closer" first; the joint ranking should not, when the driver
    // side is this lopsided.
    const ranked = rankStopsByJointOptimum(
      [
        { stopId: 'closer-but-bad-for-driver', walkDistanceMeters: 50, suitabilityScore: 0.1, deviationMeters: 290 },
        {
          stopId: 'further-but-great-for-driver',
          walkDistanceMeters: 250,
          suitabilityScore: 0.98,
          deviationMeters: 10,
        },
      ],
      1000,
      300,
    );
    expect(ranked[0]!.stopId).toBe('further-but-great-for-driver');
  });

  it('still prefers the closer stop when the driver-side difference between candidates is small', () => {
    const ranked = rankStopsByJointOptimum(
      [
        { stopId: 'closer', walkDistanceMeters: 50, suitabilityScore: 0.8, deviationMeters: 100 },
        { stopId: 'further', walkDistanceMeters: 400, suitabilityScore: 0.85, deviationMeters: 90 },
      ],
      1000,
      300,
    );
    expect(ranked[0]!.stopId).toBe('closer');
  });

  it('returns an empty ranking for an empty candidate list', () => {
    expect(rankStopsByJointOptimum([], 1000, 300)).toEqual([]);
  });
});
