import { Linking, Platform } from 'react-native';

/** Opens the device's native maps app centered on a real coordinate — Apple
 *  Maps on iOS (`maps:` scheme), whatever handles `geo:` on Android (Google
 *  Maps in practice), and a Google Maps web URL as the only fallback that
 *  makes sense outside those two platforms. Never a generic text search —
 *  the pin lands on the exact pickup/dropoff point the driver was shown. */
export function openInMaps(lat: number, lng: number, label: string): void {
  const query = encodeURIComponent(label);
  const url =
    Platform.select({
      ios: `maps:0,0?q=${query}@${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${query})`,
    }) ?? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  void Linking.openURL(url);
}
