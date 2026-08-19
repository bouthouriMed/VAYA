import { describe, it, expect } from 'vitest';
import { Fragment } from 'react';
import { MapRoute } from '../primitives/MapRoute';
import { regionForPoints } from '../utils/mapGeometry';

// MapRoute has no internal hooks, so — same technique as Phase 2's
// accessibility.test.ts — it can be called directly as a plain function
// and the returned React element inspected, without a renderer.
// MapCanvas and MapPreview both use useState (for their onMapReady
// skeleton) and can't be called this way outside a real render; covered by
// primitives.test.ts's existence check only, same documented limitation as
// Input in Phase 2. MapPreview's region-fitting logic is exercised here
// instead via regionForPoints directly (the same pure function it calls).
describe('Phase 3 real map primitives', () => {
  it('regionForPoints computes the region MapPreview/MapCanvas would use for an origin+destination pair', () => {
    const region = regionForPoints([
      { lat: 36.85, lng: 10.16 },
      { lat: 36.84, lng: 10.24 },
    ]);
    expect(region).not.toBeNull();
    expect(region!.latitude).toBeCloseTo(36.845, 2);
    expect(region!.longitude).toBeCloseTo(10.2, 2);
  });

  it('regionForPoints returns null for no points, which MapPreview/MapCanvas fall back on', () => {
    expect(regionForPoints([])).toBeNull();
  });

  it('MapRoute renders a real Polyline with the given coordinates', () => {
    const coordinates = [
      { latitude: 36.85, longitude: 10.16 },
      { latitude: 36.84, longitude: 10.24 },
    ];
    const element = MapRoute({ coordinates });
    // showCorridor defaults false, so the fragment's only child is the line Polyline.
    expect(element.type).toBe(Fragment);
    const polyline = element.props.children[1];
    expect(polyline.type).toBe('Polyline');
    expect(polyline.props.coordinates).toBe(coordinates);
  });

  it('MapRoute renders a corridor underlay when showCorridor is set', () => {
    const coordinates = [
      { latitude: 36.85, longitude: 10.16 },
      { latitude: 36.84, longitude: 10.24 },
    ];
    const element = MapRoute({ coordinates, showCorridor: true });
    const [corridor, line] = element.props.children;
    expect(corridor.type).toBe('Polyline');
    expect(line.type).toBe('Polyline');
    expect(corridor.props.strokeWidth).toBeGreaterThan(line.props.strokeWidth);
  });
});
