import { describe, it, expect } from 'vitest';
import {
  describePassengerAccess,
  estimateWalk,
  getPassengerAccessCaps,
  straightLineFromWalkMeters,
  MAX_CITY_WALK_MINUTES,
  MAX_DISPLAYED_WALK_MINUTES,
  MAX_INTERCITY_ACCESS_M,
  STREET_DISTANCE_FACTOR,
  WALK_SPEED_M_PER_MIN,
} from '../passenger-access';

describe('estimateWalk', () => {
  it('adds the street-distance factor to the straight line', () => {
    const walk = estimateWalk(1000);
    expect(walk.walkMeters).toBeCloseTo(1000 * STREET_DISTANCE_FACTOR);
    expect(walk.walkMinutes).toBeCloseTo((1000 * STREET_DISTANCE_FACTOR) / WALK_SPEED_M_PER_MIN);
  });

  it('round-trips with straightLineFromWalkMeters', () => {
    expect(straightLineFromWalkMeters(estimateWalk(742).walkMeters)).toBeCloseTo(742);
  });

  it('never returns a negative walk', () => {
    expect(estimateWalk(-5)).toEqual({ walkMeters: 0, walkMinutes: 0 });
  });
});

describe('getPassengerAccessCaps', () => {
  it.each(['commute', 'urban'] as const)('caps a %s trip at a 15-minute honest walk', (profile) => {
    const caps = getPassengerAccessCaps(profile);
    expect(estimateWalk(caps.pickupM).walkMinutes).toBeCloseTo(MAX_CITY_WALK_MINUTES);
    expect(estimateWalk(caps.dropoffM).walkMinutes).toBeCloseTo(MAX_CITY_WALK_MINUTES);
    // ~920 m straight line, ~1.2 km on foot.
    expect(caps.pickupM).toBeGreaterThan(900);
    expect(caps.pickupM).toBeLessThan(950);
  });

  it('allows an intercity meeting point a few km out, up to 10 km', () => {
    expect(getPassengerAccessCaps('intercity')).toEqual({
      pickupM: MAX_INTERCITY_ACCESS_M,
      dropoffM: MAX_INTERCITY_ACCESS_M,
    });
  });
});

describe('describePassengerAccess', () => {
  it('shows a walk in whole minutes, never 0', () => {
    expect(describePassengerAccess(0)).toEqual({ kind: 'walk', minutes: 1 });
    expect(describePassengerAccess(800)).toEqual({ kind: 'walk', minutes: 10 });
  });

  it('still shows a walk at exactly the display limit', () => {
    expect(describePassengerAccess(MAX_DISPLAYED_WALK_MINUTES * WALK_SPEED_M_PER_MIN)).toEqual({
      kind: 'walk',
      minutes: MAX_DISPLAYED_WALK_MINUTES,
    });
  });

  it('switches to a distance beyond a 20-minute walk (intercity meeting points)', () => {
    expect(describePassengerAccess(4_350)).toEqual({ kind: 'distance', kilometers: 4.4 });
    expect(describePassengerAccess(12_600)).toEqual({ kind: 'distance', kilometers: 13 });
  });

  it('a city trip never needs the distance form: its cap is under the display limit', () => {
    const cap = getPassengerAccessCaps('urban').pickupM;
    expect(describePassengerAccess(estimateWalk(cap).walkMeters).kind).toBe('walk');
  });
});
