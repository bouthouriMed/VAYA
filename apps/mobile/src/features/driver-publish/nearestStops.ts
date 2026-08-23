import type { RouteStop } from '../../state/api';

export interface RecommendedPoint {
  /** 'anchor' for the origin/destination itself, otherwise the real
   *  route_stop id — every non-anchor point here is real, server-generated
   *  candidate data, never a fabricated suggestion. */
  id: string;
  label: string;
  lat: number;
  lng: number;
  isAnchor: boolean;
  stopId: string | null;
}

const EARTH_RADIUS_M = 6_371_000;
// Below this, a candidate stop is close enough to the anchor itself that
// showing both pins would just be visual noise on top of one another.
const DEDUPE_RADIUS_M = 30;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The ~5 "system-recommended" points shown in pickup/dropoff selection mode:
 * the anchor (origin or destination, as the driver typed it) plus the
 * real, road-snapped route_stop candidates nearest to it — never invented
 * points. Sorted nearest-first (the anchor itself, at distance 0, sorts
 * first unless another stop happens to share its exact coordinate).
 */
export function buildRecommendedPoints(
  anchor: { label: string; lat: number; lng: number },
  stops: RouteStop[],
  limit = 5,
): RecommendedPoint[] {
  const ranked = stops
    .map((stop) => ({ stop, distanceMeters: haversineMeters(anchor, stop) }))
    .filter((entry) => entry.distanceMeters > DEDUPE_RADIUS_M)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const points: RecommendedPoint[] = [
    { id: 'anchor', label: anchor.label, lat: anchor.lat, lng: anchor.lng, isAnchor: true, stopId: null },
    ...ranked.map(({ stop }) => ({
      id: stop.id,
      label: stop.label,
      lat: stop.lat,
      lng: stop.lng,
      isAnchor: false,
      stopId: stop.id,
    })),
  ];

  return points.slice(0, limit);
}
