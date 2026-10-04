import type { RideItineraryRoute } from '../../state/api';
import { decodePolyline, type LatLng } from '../../utils/polyline';

export interface ItineraryLine {
  coordinates: LatLng[];
  /** True when no road geometry exists and the line just joins the
   *  itinerary's points in travel order — the map must say so and draw it
   *  dashed, never pass it off as the road. */
  isApproximate: boolean;
}

/**
 * What a trip's map draws as the itinerary, in order of preference:
 *
 *  1. the server's road itinerary (GET /rides/:id/itinerary-route) — for a
 *     driver it runs through every accepted passenger's pickup/dropoff;
 *  2. the ride's stored road route (`fallbackRoute`, already sliced to the
 *     viewer's own leg by the caller when relevant) while the itinerary is
 *     loading or unavailable;
 *  3. a straight line through the itinerary's points (or `fallbackPoints`)
 *     in travel order, flagged approximate — so the map always shows the
 *     trip's order of stops instead of two unconnected pins.
 */
export function resolveItineraryLine(
  itinerary: RideItineraryRoute | undefined,
  fallbackRoute: LatLng[],
  fallbackPoints: LatLng[],
): ItineraryLine {
  if (itinerary?.polyline) {
    const coordinates = decodePolyline(itinerary.polyline);
    if (coordinates.length > 1) return { coordinates, isApproximate: false };
  }
  if (fallbackRoute.length > 1) return { coordinates: fallbackRoute, isApproximate: false };
  const points =
    itinerary && itinerary.points.length > 1
      ? itinerary.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))
      : fallbackPoints;
  return { coordinates: points.length > 1 ? points : [], isApproximate: points.length > 1 };
}

/** Orders points by their position along the straight start -> end line
 *  (scalar projection, longitude scaled by latitude) — the travel order for
 *  an approximate itinerary when no road geometry exists. Stable for points
 *  at the same position. */
export function orderAlongStraightLine(start: LatLng, end: LatLng, points: LatLng[]): LatLng[] {
  const kx = Math.cos((start.latitude * Math.PI) / 180);
  const dx = (end.longitude - start.longitude) * kx;
  const dy = end.latitude - start.latitude;
  const lengthSq = dx * dx + dy * dy;
  const along = (p: LatLng) =>
    lengthSq === 0 ? 0 : ((p.longitude - start.longitude) * kx * dx + (p.latitude - start.latitude) * dy) / lengthSq;
  return points
    .map((point, index) => ({ point, index, t: along(point) }))
    .sort((a, b) => a.t - b.t || a.index - b.index)
    .map(({ point }) => point);
}
