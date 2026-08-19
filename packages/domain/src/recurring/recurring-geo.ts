/**
 * Small local great-circle distance helper for the recurring-pattern
 * detection algorithm (`detect-recurring-patterns.ts`). `packages/domain`
 * must stay I/O-free and cannot import `apps/api/src/lib/geo.ts` (that
 * would be a package depending on an app — backwards per this repo's
 * layering rules), so this is an intentional, tiny duplicate of the exact
 * same formula `matching.service.ts`/`stop-candidates.service.ts` use on
 * the API side. Keep both in sync if the formula ever changes (it won't —
 * haversine is a closed, stable piece of math).
 */
const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
