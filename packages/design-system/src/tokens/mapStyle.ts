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

/** VAYA's light map style — muted sage terrain, warm cream roads, soft
 *  blue-gray water, tuned to the brand's jewel-emerald/editorial palette
 *  (`lightPalette` in `theme/palette.ts`) instead of Google's default
 *  saturated red/yellow/blue. Matches the Stitch-reviewed reference
 *  screens' map rendering (request details, my trip) — no more default
 *  Google style leaking brand-off colors into every map screen. */
export const lightMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#F3F1E9' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5B6572' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#D3CFC0' }],
  },
  {
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#E7E3D5' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#7A8677' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#C7D9CC' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#587566' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#E4DFCE' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8B93A3' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#EDE8D6' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#D9D2B8' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5B6572' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#E7E3D5' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#B9D6DE' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5B7D8A' }],
  },
];

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
