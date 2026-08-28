export interface LatLng {
  latitude: number;
  longitude: number;
}

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

/** Decodes a Google/OSRM polyline-algorithm-format string (precision 5)
 *  into react-native-maps-shaped {latitude, longitude} points. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  const state = { index: 0 };
  let lat = 0;
  let lng = 0;

  while (state.index < encoded.length) {
    lat += decodeVarint(encoded, state);
    lng += decodeVarint(encoded, state);
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Real distance in km, summed segment-by-segment along the route's actual
 *  decoded geometry — not a fabricated number, just a straight-line
 *  approximation of the real OSRM/haversine-fallback polyline (curves get
 *  slightly undercounted the coarser the point sampling is, same caveat as
 *  any polyline-derived distance). */
export function polylineDistanceKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1]!, points[i]!);
  }
  return total;
}

/** Meters per minute at an average walking pace — kept numerically identical
 *  to the server's own WALK_SPEED_M_PER_MIN (apps/api/src/modules/matching/
 *  matching.service.ts) so a walk-time computed live on-device (e.g. the
 *  passenger's current position to their pickup point) never disagrees with
 *  a walk-time the server computed for the same kind of distance. */
const WALK_SPEED_M_PER_MIN = 80;

/** Real straight-line distance between two coordinates, converted to a
 *  walking-minutes estimate at an average pace — used where no server-side
 *  walk-time field exists (e.g. the passenger's live device position, which
 *  the server never sees) but real coordinates for both ends do. Same
 *  "derived, not fabricated" reasoning as polylineDistanceKm. */
export function estimateWalkMinutes(a: LatLng, b: LatLng): number {
  return (haversineKm(a, b) * 1000) / WALK_SPEED_M_PER_MIN;
}

function nearestPointIndex(points: LatLng[], target: LatLng): number {
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = haversineKm(points[i]!, target);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Slices a route's full decoded polyline down to just the sub-segment
 * between two points on it — a passenger booking a sub-trip of a longer
 * route_passthrough ride (docs/roadmap/phase-13-search-engine.md) should
 * see their OWN pickup-to-dropoff segment on the map, not the driver's
 * full route end-to-end, which can run well beyond it. Used everywhere a
 * booking's or candidate ride's map is shown to a passenger (or a specific
 * requested segment is shown to a driver) — search/ride-details.tsx,
 * bookings/[bookingId].tsx, (tabs)/trips.tsx's rider hero card,
 * RequestDetailSheet.
 *
 * Pure/approximate: picks the nearest sampled point to each end rather
 * than a true fractional projection (the server's `projectPointOntoRoute`
 * does that for matching decisions; this is display-only), and snaps the
 * slice's own endpoints to the exact requested coordinates so the drawn
 * line starts/ends precisely at the pickup/dropoff pins, not the nearest
 * sample. Falls back to the full `points` array when there's nothing
 * meaningful to slice (fewer than 2 points).
 */
export function sliceRouteBetween(points: LatLng[], start: LatLng, end: LatLng): LatLng[] {
  if (points.length < 2) return points;
  const startIdx = nearestPointIndex(points, start);
  const endIdx = nearestPointIndex(points, end);
  const [loIdx, hiIdx] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
  const middle = points.slice(loIdx, hiIdx + 1);
  const ordered = startIdx <= endIdx ? middle : [...middle].reverse();
  return [start, ...ordered, end];
}
