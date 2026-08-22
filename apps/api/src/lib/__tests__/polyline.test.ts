import { describe, it, expect } from 'vitest';
import { projectPointOntoRoute, type LatLng } from '../polyline.js';

// A straight north-south route, longitude held constant so distances are
// easy to reason about by hand (~0.01 deg latitude ≈ 1113m regardless of
// longitude). 51 points from 36.0 to 36.5 lat — a ~55.6km route, roughly
// Tunis-to-Hammamet scale, the kind of ride phase-13-search-engine.md's
// pass-through tier targets.
function straightRoute(): LatLng[] {
  const points: LatLng[] = [];
  for (let i = 0; i <= 50; i++) {
    points.push({ lat: 36.0 + (0.5 * i) / 50, lng: 10.0 });
  }
  return points;
}

describe('projectPointOntoRoute', () => {
  it('projects a point exactly on the route to ~0 distance and its true fraction', () => {
    const route = straightRoute();
    const midpoint = { lat: 36.25, lng: 10.0 };
    const result = projectPointOntoRoute(midpoint, route);
    expect(result.distanceM).toBeLessThan(50);
    expect(result.fraction).toBeGreaterThan(0.45);
    expect(result.fraction).toBeLessThan(0.55);
  });

  it('reports a real perpendicular-ish distance for a point off to the side', () => {
    const route = straightRoute();
    // ~0.01 deg longitude at lat 36 ≈ 899m east.
    const offRoute = { lat: 36.25, lng: 10.01 };
    const result = projectPointOntoRoute(offRoute, route);
    expect(result.distanceM).toBeGreaterThan(700);
    expect(result.distanceM).toBeLessThan(1100);
    expect(result.fraction).toBeGreaterThan(0.45);
    expect(result.fraction).toBeLessThan(0.55);
  });

  it('clamps a point beyond the route start to fraction ~0', () => {
    const route = straightRoute();
    const beforeStart = { lat: 35.9, lng: 10.0 };
    const result = projectPointOntoRoute(beforeStart, route);
    expect(result.fraction).toBeLessThan(0.05);
  });

  it('clamps a point beyond the route end to fraction ~1', () => {
    const route = straightRoute();
    const afterEnd = { lat: 36.6, lng: 10.0 };
    const result = projectPointOntoRoute(afterEnd, route);
    expect(result.fraction).toBeGreaterThan(0.95);
  });

  it('orders two on-route points correctly by fraction', () => {
    const route = straightRoute();
    const near = projectPointOntoRoute({ lat: 36.1, lng: 10.0 }, route);
    const far = projectPointOntoRoute({ lat: 36.4, lng: 10.0 }, route);
    expect(near.fraction).toBeLessThan(far.fraction);
  });

  it('handles an empty route honestly (infinite distance, not a false match)', () => {
    const result = projectPointOntoRoute({ lat: 36.0, lng: 10.0 }, []);
    expect(result.distanceM).toBe(Infinity);
  });

  it('handles a single-point route as a plain point-to-point distance', () => {
    const single = [{ lat: 36.0, lng: 10.0 }];
    const result = projectPointOntoRoute({ lat: 36.01, lng: 10.0 }, single);
    expect(result.distanceM).toBeGreaterThan(1000);
    expect(result.distanceM).toBeLessThan(1200);
    expect(result.fraction).toBe(0);
  });
});
