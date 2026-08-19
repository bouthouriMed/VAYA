export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Smallest region (react-native-maps shape) that frames every given point,
 *  with padding so pins don't sit flush against the map edge. Falls back to
 *  a tight default zoom around a single point. */
export function regionForPoints(points: LatLngPoint[], paddingFactor = 1.6): MapRegion | null {
  if (points.length === 0) return null;

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const MIN_DELTA = 0.01; // ~1km — avoids an absurdly tight zoom for a single point
  const latitudeDelta = Math.max((maxLat - minLat) * paddingFactor, MIN_DELTA);
  const longitudeDelta = Math.max((maxLng - minLng) * paddingFactor, MIN_DELTA);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}
