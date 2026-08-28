import { describe, it, expect } from 'vitest';
import { getMatchingThresholds } from '../matching-thresholds';

describe('getMatchingThresholds', () => {
  it("returns today's exact flat matching constants for the 'urban' profile — introducing this table changes nothing for a mid-length trip", () => {
    expect(getMatchingThresholds('urban')).toEqual({
      tightPickupRadiusM: 2_000,
      tightDropoffRadiusM: 3_000,
      widePickupRadiusM: 8_000,
      wideDropoffRadiusM: 10_000,
      corridorWidthM: 150,
      detourFloorSec: 180,
      detourCeilingSec: 720,
    });
  });

  it('is tighter than urban on every radius/corridor field for a commute-length trip', () => {
    const commute = getMatchingThresholds('commute');
    const urban = getMatchingThresholds('urban');
    expect(commute.tightPickupRadiusM).toBeLessThan(urban.tightPickupRadiusM);
    expect(commute.tightDropoffRadiusM).toBeLessThan(urban.tightDropoffRadiusM);
    expect(commute.widePickupRadiusM).toBeLessThan(urban.widePickupRadiusM);
    expect(commute.wideDropoffRadiusM).toBeLessThan(urban.wideDropoffRadiusM);
    expect(commute.corridorWidthM).toBeLessThan(urban.corridorWidthM);
  });

  it('gives a commute trip a lower detour ceiling than urban, without lowering the floor below a usable minimum', () => {
    const commute = getMatchingThresholds('commute');
    const urban = getMatchingThresholds('urban');
    expect(commute.detourCeilingSec).toBeLessThan(urban.detourCeilingSec);
    expect(commute.detourFloorSec).toBeGreaterThan(0);
  });

  it('is wider than urban on every radius/corridor field for an intercity trip', () => {
    const intercity = getMatchingThresholds('intercity');
    const urban = getMatchingThresholds('urban');
    expect(intercity.tightPickupRadiusM).toBeGreaterThan(urban.tightPickupRadiusM);
    expect(intercity.tightDropoffRadiusM).toBeGreaterThan(urban.tightDropoffRadiusM);
    expect(intercity.widePickupRadiusM).toBeGreaterThan(urban.widePickupRadiusM);
    expect(intercity.wideDropoffRadiusM).toBeGreaterThan(urban.wideDropoffRadiusM);
    expect(intercity.corridorWidthM).toBeGreaterThan(urban.corridorWidthM);
  });

  it('gives an intercity trip a higher detour ceiling than urban', () => {
    const intercity = getMatchingThresholds('intercity');
    const urban = getMatchingThresholds('urban');
    expect(intercity.detourCeilingSec).toBeGreaterThan(urban.detourCeilingSec);
  });

  it('is monotonically non-decreasing commute -> urban -> intercity across every field', () => {
    const commute = getMatchingThresholds('commute');
    const urban = getMatchingThresholds('urban');
    const intercity = getMatchingThresholds('intercity');
    for (const key of Object.keys(commute) as (keyof typeof commute)[]) {
      expect(commute[key]).toBeLessThanOrEqual(urban[key]);
      expect(urban[key]).toBeLessThanOrEqual(intercity[key]);
    }
  });

  it('dropoff radius is always at least as wide as pickup radius within a profile (destination tolerance was already looser than pickup tolerance today)', () => {
    for (const type of ['commute', 'urban', 'intercity'] as const) {
      const t = getMatchingThresholds(type);
      expect(t.tightDropoffRadiusM).toBeGreaterThanOrEqual(t.tightPickupRadiusM);
      expect(t.wideDropoffRadiusM).toBeGreaterThanOrEqual(t.widePickupRadiusM);
    }
  });
});
