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
