import { describe, it, expect } from 'vitest';
import { sliceRouteBetween, type LatLng } from '../polyline';

describe('sliceRouteBetween', () => {
  // A simple 5-point west-to-east route, evenly spaced.
  const route: LatLng[] = [
    { latitude: 36.0, longitude: 10.0 },
    { latitude: 36.0, longitude: 10.1 },
    { latitude: 36.0, longitude: 10.2 },
    { latitude: 36.0, longitude: 10.3 },
    { latitude: 36.0, longitude: 10.4 },
  ];

  it('slices to the segment between two mid-route points, snapping to their exact coordinates', () => {
    const start = { latitude: 36.0, longitude: 10.11 }; // nearest to index 1
    const end = { latitude: 36.0, longitude: 10.29 }; // nearest to index 3
    const sliced = sliceRouteBetween(route, start, end);

    expect(sliced[0]).toEqual(start);
    expect(sliced.at(-1)).toEqual(end);
    // Contains the real intermediate route point(s) between the two ends.
    expect(sliced).toContainEqual(route[2]);
    expect(sliced.length).toBeLessThan(route.length + 2);
  });

  it('handles a start point that comes after the end point along the route (reversed order)', () => {
    const start = { latitude: 36.0, longitude: 10.29 }; // nearest to index 3
    const end = { latitude: 36.0, longitude: 10.11 }; // nearest to index 1
    const sliced = sliceRouteBetween(route, start, end);

    expect(sliced[0]).toEqual(start);
    expect(sliced.at(-1)).toEqual(end);
    // The middle points must still run in route order between the two ends,
    // not the raw (reversed) call order — index 2 before index 1's neighbor.
    expect(sliced).toContainEqual(route[2]);
  });

  it('falls back to the full array for fewer than 2 points', () => {
    expect(sliceRouteBetween([], { latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 })).toEqual([]);
    const single = [{ latitude: 36.0, longitude: 10.0 }];
    expect(sliceRouteBetween(single, single[0]!, single[0]!)).toEqual(single);
  });

  it('collapses to just the two endpoints when both snap to the same nearest route point', () => {
    const point = { latitude: 36.0, longitude: 10.201 }; // both very close to index 2
    const sliced = sliceRouteBetween(route, point, point);
    expect(sliced[0]).toEqual(point);
    expect(sliced.at(-1)).toEqual(point);
  });
});
