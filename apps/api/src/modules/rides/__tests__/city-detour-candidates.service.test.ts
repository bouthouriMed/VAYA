import { describe, it, expect } from 'vitest';
import {
  cityStopSampleIntervalM,
  dedupeCities,
  type CityDetourCandidate,
} from '../city-detour-candidates.service.js';

describe('cityStopSampleIntervalM', () => {
  it('uses the profile base interval for a route well within the sample cap', () => {
    // 30km at the 'urban' base (6000m) -> 5 samples, well under the 24 cap.
    expect(cityStopSampleIntervalM(30_000, 'urban')).toBe(6000);
  });

  it('widens the interval for a very long route so the sample count never exceeds the cap', () => {
    // 700km intercity route at the 12000m base would produce ~58 samples —
    // must widen to keep the real reverse-geocode call count bounded.
    const interval = cityStopSampleIntervalM(700_000, 'intercity');
    expect(interval).toBeGreaterThan(12_000);
    expect(700_000 / interval).toBeLessThanOrEqual(24);
  });

  it('never returns less than the profile base interval for a short route', () => {
    expect(cityStopSampleIntervalM(5_000, 'commute')).toBe(3000);
  });
});

describe('dedupeCities', () => {
  const zaragoza: CityDetourCandidate = { label: 'Zaragoza', lat: 41.6488, lng: -0.8891 };
  const zaragozaNearby: CityDetourCandidate = { label: 'Zaragoza', lat: 41.6499, lng: -0.887 };
  const logrono: CityDetourCandidate = { label: 'Logroño', lat: 42.4627, lng: -2.445 };

  it('keeps genuinely distinct, far-apart cities', () => {
    expect(dedupeCities([zaragoza, logrono], 5000)).toEqual([zaragoza, logrono]);
  });

  it('merges two samples that resolve to the same city within the merge radius, keeping the first occurrence', () => {
    const result = dedupeCities([zaragoza, zaragozaNearby, logrono], 5000);
    expect(result).toEqual([zaragoza, logrono]);
  });

  it('merges by identical label even when far apart (a large city sampled from two distant points)', () => {
    const farSample: CityDetourCandidate = { label: 'Zaragoza', lat: 41.7, lng: -0.95 };
    const result = dedupeCities([zaragoza, farSample], 100);
    expect(result).toEqual([zaragoza]);
  });

  it('returns an empty list for empty input', () => {
    expect(dedupeCities([], 5000)).toEqual([]);
  });
});
