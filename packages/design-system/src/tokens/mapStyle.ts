/**
 * `customMapStyle` arrays for `react-native-maps`' Google-provider style,
 * consumed by every screen with a real MapView (`explore.tsx`, `MapCanvas`,
 * `MapPreview`, `results.tsx`) so the map follows `useAppTheme()`'s scheme
 * instead of always forcing the light Google style regardless of dark mode.
 */
export interface MapStyleElement {
  elementType?: string;
  featureType?: string;
  stylers: Record<string, string | number>[];
}

/** The Google Maps default light style — explicit empty array, not a
 *  missing prop, so intent reads the same as the dark variant below. */
export const lightMapStyle: MapStyleElement[] = [];

/** A standard dark/"night" Google Maps style (muted navy water, dark
 *  charcoal land, low-contrast road strokes, dimmed labels) — the same
 *  family of style widely used by ride-hailing apps for a night map, tuned
 *  to sit next to this app's `darkPalette` (near-black surfaces, mint
 *  accent) rather than clash with it. */
export const darkMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1B2540' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7C839B' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1220' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#3F465C' }],
  },
  {
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#213145' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#7C839B' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#14261C' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4EDEA3' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#213145' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0B1220' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#7C839B' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#3F465C' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0B1220' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#BEC6E0' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#213145' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0B1220' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3F465C' }],
  },
];
