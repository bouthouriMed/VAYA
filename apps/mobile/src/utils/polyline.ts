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
