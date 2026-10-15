import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MEETING_WEIGHTS,
  estimateRoadsideDetourSeconds,
  passengerAccessSeconds,
  pickBestMeetingOption,
  scoreMeetingOption,
} from '../meeting-point-score';

describe('passengerAccessSeconds', () => {
  it('is a walk in town, however far', () => {
    // 1 km straight line -> 1.3 km on foot at 80 m/min = 16.25 min.
    expect(passengerAccessSeconds(1000, 'commute')).toBeCloseTo(975);
    expect(passengerAccessSeconds(5000, 'urban')).toBeCloseTo(4875);
  });

  it('becomes a short ride for an intercity pickup beyond a 20-minute walk', () => {
    const walk = passengerAccessSeconds(1000, 'intercity');
    const ride = passengerAccessSeconds(8000, 'intercity');
    expect(walk).toBeCloseTo(975);
    // 300 s to find a taxi + 10.4 km at 7 m/s.
    expect(ride).toBeCloseTo(300 + 10400 / 7);
    expect(ride).toBeLessThan(passengerAccessSeconds(8000, 'commute'));
  });
});

describe('scoreMeetingOption / pickBestMeetingOption', () => {
  it('prefers a petrol station a short walk away over a bare point on the road right next to the passenger', () => {
    const best = pickBestMeetingOption(
      [
        { id: 'raw', kind: 'on_route' as const, accessStraightLineM: 150, detourSeconds: 0 },
        { id: 'fuel', kind: 'fuel_station' as const, accessStraightLineM: 300, detourSeconds: 10 },
      ],
      'commute',
    );
    expect(best?.id).toBe('fuel');
  });

  it("weighs the driver's minutes more than the passenger's walk", () => {
    const walk60 = scoreMeetingOption({ kind: 'bus_stop', accessStraightLineM: (60 * 80) / 1.3 / 60, detourSeconds: 0 }, 'commute');
    const detour60 = scoreMeetingOption({ kind: 'bus_stop', accessStraightLineM: 0, detourSeconds: 60 }, 'commute');
    expect(detour60).toBeGreaterThan(walk60);
  });

  it('accepts a farther intercity pickup more readily than a city one', () => {
    const options = [
      { id: 'near-raw', kind: 'on_route' as const, accessStraightLineM: 1500, detourSeconds: 0 },
      { id: 'far-louage', kind: 'louage_station' as const, accessStraightLineM: 3000, detourSeconds: 30 },
    ];
    expect(pickBestMeetingOption(options, 'commute')?.id).toBe('near-raw');
    expect(pickBestMeetingOption(options, 'intercity')?.id).toBe('far-louage');
  });

  it("credits points people actually use, and points inside the driver's areas", () => {
    const base = { kind: 'roundabout' as const, accessStraightLineM: 300, detourSeconds: 20 };
    const plain = scoreMeetingOption(base, 'urban');
    expect(scoreMeetingOption({ ...base, usageCount: 4 }, 'urban')).toBeCloseTo(plain - 4 * DEFAULT_MEETING_WEIGHTS.usageBoostSeconds);
    expect(scoreMeetingOption({ ...base, usageCount: 500 }, 'urban')).toBeCloseTo(plain - 20 * DEFAULT_MEETING_WEIGHTS.usageBoostSeconds);
    expect(scoreMeetingOption({ ...base, inDriverArea: true }, 'urban')).toBeCloseTo(plain - DEFAULT_MEETING_WEIGHTS.areaBoostSeconds);
  });

  it('returns null for no options', () => {
    expect(pickBestMeetingOption([], 'urban')).toBeNull();
  });
});

describe('estimateRoadsideDetourSeconds', () => {
  it('is zero on the route and there-and-back off it', () => {
    expect(estimateRoadsideDetourSeconds(0)).toBe(0);
    expect(estimateRoadsideDetourSeconds(83)).toBeCloseTo(20);
  });
});
