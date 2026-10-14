import { Linking } from 'react-native';
import { buildGoogleMapsDirectionsUrl } from './googleMapsLink';

type DirectionsOptions = Parameters<typeof buildGoogleMapsDirectionsUrl>[0];

/**
 * The one way any VAYA screen sends someone to a map: Google Maps
 * directions, built from coordinates (googleMapsLink.ts) — the Google Maps
 * app when installed, the browser otherwise. Every Maps button in the app
 * goes through here, so they all behave the same. (This used to drop a pin
 * labelled with the stored place text — Apple Maps on iOS, a Plus Code in
 * the label — while newer buttons opened directions.)
 *
 * Resolves false when nothing could open the link, so the caller can say so.
 */
export async function openDirections(options: DirectionsOptions): Promise<boolean> {
  try {
    await Linking.openURL(buildGoogleMapsDirectionsUrl(options));
    return true;
  } catch {
    return false;
  }
}
