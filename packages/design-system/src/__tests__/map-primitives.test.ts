import { describe, it, expect } from 'vitest';
import { Fragment, createElement } from 'react';
import { MapRoute } from '../primitives/MapRoute';
import { MapPreview } from '../primitives/MapPreview';
import { regionForPoints } from '../utils/mapGeometry';
import { lightPalette } from '../theme/palette';
import { renderJSON } from './test-utils/renderJSON';

type JsonNode = { type: string; props: Record<string, unknown>; children?: (JsonNode | string)[] | null };

function findAllByType(node: JsonNode | JsonNode[] | string | null, type: string): JsonNode[] {
  if (node === null || typeof node === 'string') return [];
  if (Array.isArray(node)) return node.flatMap((n) => findAllByType(n, type));
  const self = node.type === type ? [node] : [];
  return [...self, ...findAllByType((node.children as JsonNode[] | null) ?? [], type)];
}

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
    expect(element.type).toBe(Fragment);
    const polyline = element.props.children[1];
    expect(polyline.type).toBe('Polyline');
    expect(polyline.props.coordinates).toBe(coordinates);
  });

  // Regression test for a real reproduced iOS crash: toggling `showCorridor`
  // used to conditionally mount/unmount the corridor Polyline node entirely
  // (`{showCorridor ? <Polyline/> : null}`), so a MapView holding several
  // MapRoutes (the publish wizard's route-selection step) changed its total
  // native overlay count every time the selected route changed — tapping a
  // different route option crashed and dismissed the whole app on iOS.
  // MapRoute must now ALWAYS mount both Polyline nodes and only ever toggle
  // the corridor's visibility via a transparent stroke color, never via
  // presence/absence of the node itself.
  it('MapRoute always mounts both Polyline nodes, regardless of showCorridor, to keep MapView overlay count stable', () => {
    const coordinates = [
      { latitude: 36.85, longitude: 10.16 },
      { latitude: 36.84, longitude: 10.24 },
    ];
    const hidden = MapRoute({ coordinates, showCorridor: false });
    const [hiddenCorridor, hiddenLine] = hidden.props.children;
    expect(hiddenCorridor.type).toBe('Polyline');
    expect(hiddenCorridor.props.strokeColor).toBe('transparent');
    expect(hiddenLine.type).toBe('Polyline');

    const shown = MapRoute({ coordinates, showCorridor: true });
    const [corridor, line] = shown.props.children;
    expect(corridor.type).toBe('Polyline');
    expect(line.type).toBe('Polyline');
    expect(corridor.props.strokeColor).not.toBe('transparent');
    expect(corridor.props.strokeWidth).toBeGreaterThan(line.props.strokeWidth);
  });
});

// MapPreview does use useState (for its onMapReady skeleton), unlike
// MapRoute above — but react-test-renderer handles that fine via
// renderJSON (see ride-stop-markers.test.tsx for the same pattern against
// the mocked opaque 'View'/'Ionicons' host types); react-native-maps'
// mock makes MapView/Marker/Polyline equally opaque host-type strings, so
// this doesn't need a real native bridge either.
describe('MapPreview occupancy segments (driver ride-hub itinerary thread)', () => {
  const A = { latitude: 36.8, longitude: 10.18 };
  const B = { latitude: 36.82, longitude: 10.2 };
  const C = { latitude: 36.84, longitude: 10.22 };

  it('colors each leg by onboard seats: dashed/outline when empty, accent for one, accentStrong for two+', () => {
    const tree = renderJSON(
      createElement(MapPreview, {
        theme: lightPalette,
        occupancySegments: [
          { coordinates: [A, B], onboardSeats: 0 },
          { coordinates: [B, C], onboardSeats: 1 },
          { coordinates: [C, A], onboardSeats: 2 },
        ],
      }),
    );

    const polylines = findAllByType(tree as JsonNode, 'Polyline');
    expect(polylines).toHaveLength(3);

    expect(polylines[0]!.props.strokeColor).toBe(lightPalette.outline);
    expect(polylines[0]!.props.lineDashPattern).toEqual([6, 6]);

    expect(polylines[1]!.props.strokeColor).toBe(lightPalette.accent);
    expect(polylines[1]!.props.lineDashPattern).toBeUndefined();

    expect(polylines[2]!.props.strokeColor).toBe(lightPalette.accentStrong);
    expect(polylines[2]!.props.strokeWidth).toBeGreaterThan(polylines[1]!.props.strokeWidth as number);
  });

  it('falls back to a single flat routeCoordinates polyline when no occupancySegments are given', () => {
    const tree = renderJSON(createElement(MapPreview, { routeCoordinates: [A, B, C] }));
    const polylines = findAllByType(tree as JsonNode, 'Polyline');
    expect(polylines).toHaveLength(1);
    expect(polylines[0]!.props.coordinates).toEqual([A, B, C]);
  });

  it('ignores occupancySegments when no theme is given, same as showPremiumPins', () => {
    const tree = renderJSON(
      createElement(MapPreview, {
        routeCoordinates: [A, B, C],
        occupancySegments: [{ coordinates: [A, B], onboardSeats: 1 }],
      }),
    );
    const polylines = findAllByType(tree as JsonNode, 'Polyline');
    expect(polylines).toHaveLength(1);
    expect(polylines[0]!.props.coordinates).toEqual([A, B, C]);
  });
});
