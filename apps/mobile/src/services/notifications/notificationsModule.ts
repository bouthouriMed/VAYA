import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import type * as ExpoNotifications from 'expo-notifications';

type NotificationsModule = typeof ExpoNotifications;

/**
 * Remote (push) notifications were removed from Expo Go on Android in SDK
 * 53 — merely importing `expo-notifications` there throws an uncaught
 * error at app start ("Android Push notifications ... was removed from
 * Expo Go"). Development builds, standalone builds and iOS Expo Go are
 * unaffected.
 */
export const pushUnavailableInThisClient = Platform.OS === 'android' && isRunningInExpoGo();

let cached: NotificationsModule | null | undefined;

/**
 * `expo-notifications`, loaded lazily so the module is never evaluated
 * where it can't work. Returns null in Expo Go on Android: every caller
 * then degrades to "no push on this device", exactly like a missing push
 * token already does — the rest of the app runs normally.
 */
export function loadNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (pushUnavailableInThisClient) {
    cached = null;
    return cached;
  }
  // A static import would evaluate the module (and throw) before this check
  // runs — the lazy require is the whole point of this file.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  cached = require('expo-notifications') as NotificationsModule;
  return cached;
}
