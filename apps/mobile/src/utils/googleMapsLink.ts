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

/** Plain decimal degrees, never exponent notation or NaN. */
const coord = (p: MapsPoint): string => `${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}`;

/**
 * Google's documented cross-platform Maps URL
 * (https://developers.google.com/maps/documentation/urls/get-started#directions-action):
 * opens the Google Maps app when installed, the browser otherwise. With no
 * `origin`, Google routes from the user's current location.
 *
 * Built by hand rather than with URLSearchParams: that percent-encodes the
 * comma inside each coordinate pair (`36.79%2C10.11`), and the Google Maps
 * Android app was reported (2026-10-15, Android tablet) opening with no
 * destination at all from such a link. Coordinates are plain numbers, so
 * literal commas need no escaping; the waypoint separator is escaped as the
 * docs require.
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
  const parts = ['api=1'];
  if (origin) parts.push(`origin=${coord(origin)}`);
  parts.push(`destination=${coord(destination)}`);
  const kept = waypoints.slice(0, MAX_MAPS_WAYPOINTS);
  if (kept.length > 0) parts.push(`waypoints=${kept.map(coord).join('%7C')}`);
  parts.push(`travelmode=${travelMode}`);
  return `https://www.google.com/maps/dir/?${parts.join('&')}`;
}
