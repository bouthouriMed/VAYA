import { describe, it, expect } from 'vitest';
import { buildRecommendedPoints, haversineMeters } from '../nearestStops';
import type { RouteStop } from '../../../state/api';

const TUNIS = { lat: 36.8065, lng: 10.1815 };

function stop(overrides: Partial<RouteStop> = {}): RouteStop {
  return {
    id: 'stop-1',
    rideId: 'ride-1',
    sequence: 0,
    label: 'Test stop',
    lat: TUNIS.lat,
    lng: TUNIS.lng,
    roadSnapped: true,
    deviationMeters: 20,
    deviationSeconds: 10,
    suitabilityScore: 0.8,
    roadClass: 'secondary',
    isDriverSelected: false,
    ...overrides,
  };
}

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(TUNIS, TUNIS)).toBe(0);
  });

  it('returns a positive distance for distinct points', () => {
    const d = haversineMeters(TUNIS, { lat: TUNIS.lat + 0.01, lng: TUNIS.lng });
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1200);
  });
});

describe('buildRecommendedPoints', () => {
  const anchor = { label: 'Tunis Centre', lat: TUNIS.lat, lng: TUNIS.lng };

  it('always includes the anchor first among equally-near candidates', () => {
    const points = buildRecommendedPoints(anchor, [
      stop({ id: 'far', lat: TUNIS.lat + 0.05, lng: TUNIS.lng }),
    ]);
    expect(points[0]).toMatchObject({ id: 'anchor', isAnchor: true, label: 'Tunis Centre' });
  });

  it('sorts real candidates nearest-first', () => {
    const near = stop({ id: 'near', lat: TUNIS.lat + 0.001, lng: TUNIS.lng });
    const far = stop({ id: 'far', lat: TUNIS.lat + 0.02, lng: TUNIS.lng });
    const points = buildRecommendedPoints(anchor, [far, near]);
    expect(points.map((p) => p.id)).toEqual(['anchor', 'near', 'far']);
  });

  it('caps at the given limit', () => {
    const stops = Array.from({ length: 10 }, (_, i) =>
      stop({ id: `s${i}`, lat: TUNIS.lat + 0.001 * (i + 1), lng: TUNIS.lng }),
    );
    const points = buildRecommendedPoints(anchor, stops, 5);
    expect(points).toHaveLength(5);
  });

  it('drops a candidate that sits on top of the anchor (dedupe radius)', () => {
    const onAnchor = stop({ id: 'same', lat: TUNIS.lat, lng: TUNIS.lng });
    const points = buildRecommendedPoints(anchor, [onAnchor]);
    expect(points.map((p) => p.id)).toEqual(['anchor']);
  });

  it('returns just the anchor when there are no candidates', () => {
    const points = buildRecommendedPoints(anchor, []);
    expect(points).toEqual([
      { id: 'anchor', label: 'Tunis Centre', lat: TUNIS.lat, lng: TUNIS.lng, isAnchor: true, stopId: null },
    ]);
  });
});
