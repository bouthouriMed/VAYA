import { haversineDistanceMeters } from './geo.js';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Decodes one signed varint starting at `state.index`, advancing it past
 *  the bytes it consumed — shared by lat/lng decoding below. */
function decodeVarint(encoded: string, state: { index: number }): number {
  let result = 0;
  let shift = 0;
  let byte: number;
  do {
    byte = encoded.charCodeAt(state.index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);
  return result & 1 ? ~(result >> 1) : result >> 1;
}

/** Decodes a Google polyline-algorithm-format string (OSRM's default
 *  `geometries=polyline` output, precision 5) into a list of points. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  const state = { index: 0 };
  let lat = 0;
  let lng = 0;

  while (state.index < encoded.length) {
    lat += decodeVarint(encoded, state);
    lng += decodeVarint(encoded, state);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/** Evenly resamples a polyline into `count` points along its length
 *  (by cumulative distance, not by vertex index) so a sparse/dense source
 *  polyline yields a consistent number of comparison points. */
export function resamplePolyline(points: LatLng[], count: number): LatLng[] {
  if (points.length === 0 || count <= 0) return [];
  if (points.length === 1) return Array.from({ length: count }, () => points[0]!);

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = haversineDistanceMeters(points[i]!, points[i + 1]!);
    segmentLengths.push(len);
    totalLength += len;
  }
  if (totalLength === 0) return Array.from({ length: count }, () => points[0]!);

  const result: LatLng[] = [];
  for (let s = 0; s < count; s++) {
    const targetDist = (s / Math.max(1, count - 1)) * totalLength;
    let covered = 0;
    let segmentIndex = 0;
    while (
      segmentIndex < segmentLengths.length - 1 &&
      covered + segmentLengths[segmentIndex]! < targetDist
    ) {
      covered += segmentLengths[segmentIndex]!;
      segmentIndex++;
    }
    const segLen = segmentLengths[segmentIndex]!;
    const t = segLen === 0 ? 0 : (targetDist - covered) / segLen;
    const a = points[segmentIndex]!;
    const b = points[segmentIndex + 1]!;
    result.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
  }
  return result;
}

/** Shortest distance in meters from `point` to the nearest vertex among
 *  `polyline`'s (already-sampled) points — a cheap approximation of
 *  point-to-line distance that's accurate enough at the ~100-200m corridor
 *  widths this is used for, given polylines sampled densely via
 *  resamplePolyline. */
function distanceToNearestVertex(point: LatLng, polyline: LatLng[]): number {
  let best = Infinity;
  for (const p of polyline) {
    const d = haversineDistanceMeters(point, p);
    if (d < best) best = d;
  }
  return best;
}

/** Cumulative distance (meters) from `polyline[0]` to each point in
 *  `polyline`, same length as `polyline` — the along-route "odometer" that
 *  `projectPointOntoRoute` turns a nearest-vertex index into a 0..1
 *  fraction with. */
function cumulativeDistances(polyline: LatLng[]): number[] {
  const distances = [0];
  for (let i = 1; i < polyline.length; i++) {
    distances.push(distances[i - 1]! + haversineDistanceMeters(polyline[i - 1]!, polyline[i]!));
  }
  return distances;
}

export interface RouteProjection {
  /** Distance in meters from `point` to the nearest sampled point on the
   *  route — the same "dense sample + nearest vertex" corridor-distance
   *  approximation `computeRouteOverlapFraction` already uses. */
  distanceM: number;
  /** 0..1 position along the route by cumulative distance, 0 = route start,
   *  1 = route end. Used to check that a rider's origin and destination
   *  fall on the route in the correct order, not just both "somewhere near
   *  it". */
  fraction: number;
  nearestPoint: LatLng;
}

/** Projects `point` onto `route` (a decoded, real OSRM polyline) — the core
 *  primitive behind route-passthrough matching (docs/roadmap/
 *  phase-13-search-engine.md): does a ride's actual road path run near this
 *  point, and if so, how far along the route. Resamples densely first
 *  (`resamplePolyline`) so a sparse source polyline still yields a stable
 *  answer, mirroring `computeRouteOverlapFraction`'s own approach at the
 *  same corridor scale rather than introducing a second geometric method —
 *  but unlike that function's fixed sample count (fine for a coarse overlap
 *  *percentage*), this feeds a strict corridor-width qualification check
 *  (`OVERLAP_CORRIDOR_WIDTH_M`, 150m), so sample spacing must stay well
 *  under that regardless of the route's total length: `targetSpacingM`
 *  drives the sample count instead of a fixed number, capped to keep a
 *  very long intercity route's cost bounded. */
export function projectPointOntoRoute(
  point: LatLng,
  route: LatLng[],
  targetSpacingM = 25,
): RouteProjection {
  if (route.length === 0) {
    return { distanceM: Infinity, fraction: 0, nearestPoint: point };
  }
  if (route.length === 1) {
    return { distanceM: haversineDistanceMeters(point, route[0]!), fraction: 0, nearestPoint: route[0]! };
  }

  const routeLength = cumulativeDistances(route).at(-1)!;
  const sampleCount = Math.min(3000, Math.max(50, Math.ceil(routeLength / targetSpacingM) + 1));
  const dense = resamplePolyline(route, sampleCount);
  const distances = cumulativeDistances(dense);
  const totalLength = distances[distances.length - 1]!;

  let bestIndex = 0;
  let bestDistanceM = Infinity;
  for (let i = 0; i < dense.length; i++) {
    const d = haversineDistanceMeters(point, dense[i]!);
    if (d < bestDistanceM) {
      bestDistanceM = d;
      bestIndex = i;
    }
  }

  return {
    distanceM: bestDistanceM,
    fraction: totalLength === 0 ? 0 : distances[bestIndex]! / totalLength,
    nearestPoint: dense[bestIndex]!,
  };
}

/** Fraction (0..1) of `routeA`'s length that runs within `corridorWidthM` of
 *  `routeB` — the real geometric replacement for a distance-ratio proxy.
 *  Both inputs should already be decoded polylines. */
export function computeRouteOverlapFraction(
  routeA: LatLng[],
  routeB: LatLng[],
  corridorWidthM: number,
  sampleCount = 20,
): number {
  if (routeA.length === 0 || routeB.length === 0) return 0;
  const samplesA = resamplePolyline(routeA, sampleCount);
  const denseB = resamplePolyline(routeB, sampleCount * 3);

  const withinCorridor = samplesA.filter(
    (point) => distanceToNearestVertex(point, denseB) <= corridorWidthM,
  ).length;

  return withinCorridor / samplesA.length;
}

/** Cheap, local approximation of a decoded route's total length — no
 *  network call, just sums consecutive-point haversine distances over an
 *  already-decoded polyline. Shared by matching.service.ts (an
 *  informational `extraDistanceMeters` figure, never the hard-rejection
 *  gate) and bookings.service.ts (classifying a ride's trip profile to
 *  pick the right detour allowance when validating a free-form pickup/
 *  dropoff) — moved here from matching.service.ts so both can import one
 *  real implementation instead of duplicating it. */
export function polylineLengthMeters(points: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistanceMeters(points[i]!, points[i + 1]!);
  }
  return total;
}
