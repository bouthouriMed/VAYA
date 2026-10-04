import { describe, it, expect } from 'vitest';
import { accessAmount, accessLabel, walkMetersForStraightLine } from '../passengerAccess';

// A t() that shows exactly which key and values were used.
const t = (key: string, params?: Record<string, unknown>): string =>
  params
    ? `${key}(${Object.entries(params)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(',')})`
    : key;

describe('passengerAccess', () => {
  it('describes a reasonable walk in minutes', () => {
    expect(accessLabel(t, 480, 'en')).toBe(
      'search:walk.suffix(minutes=common:terms.minute(count=6))',
    );
    expect(accessAmount(t, 480, 'en')).toBe('common:terms.minute(count=6)');
  });

  it('never shows a walk above 20 minutes: an intercity meeting point reads as a distance', () => {
    expect(accessLabel(t, 4_350, 'en')).toBe('search:walk.distanceAway(distance=4.4 km)');
    expect(accessAmount(t, 4_350, 'fr')).toBe('4,4 km');
  });

  it('adds the street factor to a straight-line distance the device measured', () => {
    expect(walkMetersForStraightLine(1000)).toBeCloseTo(1300);
  });
});
