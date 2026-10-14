/** A point on the ride, as coordinates (never a free-text address, so the
 *  link can't resolve to a different place than the one VAYA stored). */
export interface MapsPoint {
  lat: number;
  lng: number;
}

/** Google Maps URLs allow at most 9 waypoints (fewer in some mobile
 *  browsers); past that, the extra stops are dropped rather than the link
 *  failing outright. */
export const MAX_MAPS_WAYPOINTS = 9;

const coord = (p: MapsPoint): string => `${p.lat},${p.lng}`;

/**
 * Google's documented cross-platform Maps URL
 * (https://developers.google.com/maps/documentation/urls/get-started#directions-action):
 * opens the Google Maps app when installed, the browser otherwise. With no
 * `origin`, Google routes from the user's current location.
 */
export function buildGoogleMapsDirectionsUrl({
  origin,
  destination,
  waypoints = [],
  travelMode = 'driving',
}: {
  origin?: MapsPoint;
  destination: MapsPoint;
  waypoints?: readonly MapsPoint[];
  /** 'walking' for a passenger heading to a meeting point. */
  travelMode?: 'driving' | 'walking';
}): string {
  const params = new URLSearchParams({ api: '1', destination: coord(destination), travelmode: travelMode });
  if (origin) params.set('origin', coord(origin));
  const kept = waypoints.slice(0, MAX_MAPS_WAYPOINTS);
  if (kept.length > 0) params.set('waypoints', kept.map(coord).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
