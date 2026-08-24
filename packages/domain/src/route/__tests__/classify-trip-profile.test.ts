import { describe, it, expect } from 'vitest';
import { classifyTripProfile } from '../classify-trip-profile';

describe('classifyTripProfile', () => {
  it('classifies a short hop as "commute"', () => {
    const profile = classifyTripProfile(3_000);
    expect(profile.type).toBe('commute');
    expect(profile.sampleIntervalM).toBe(500);
  });

  it('is inclusive at the commute/urban boundary (15km)', () => {
    expect(classifyTripProfile(15_000).type).toBe('commute');
    expect(classifyTripProfile(15_001).type).toBe('urban');
  });

  it('classifies a mid-length trip as "urban"', () => {
    const profile = classifyTripProfile(30_000);
    expect(profile.type).toBe('urban');
    expect(profile.sampleIntervalM).toBe(1_000);
    expect(profile.maxCandidates).toBe(8);
  });

  it('is inclusive at the urban/intercity boundary (45km)', () => {
    expect(classifyTripProfile(45_000).type).toBe('urban');
    expect(classifyTripProfile(45_001).type).toBe('intercity');
  });

  it('classifies a long haul as "intercity" with wider spacing and more candidates', () => {
    const profile = classifyTripProfile(120_000);
    expect(profile.type).toBe('intercity');
    expect(profile.sampleIntervalM).toBe(2_500);
    expect(profile.maxCandidates).toBe(12);
    expect(profile.mergeRadiusM).toBe(300);
  });

  it('never throws on a negative or zero distance, treating it as 0', () => {
    expect(classifyTripProfile(0).type).toBe('commute');
    expect(classifyTripProfile(-500).type).toBe('commute');
  });
});
