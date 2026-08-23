import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Foreground display policy: suppress the native banner/list/sound/badge
 * entirely. Foreground events render through our own Toast instead (Phase
 * 2, wired in useNotificationSetup.ts) so the same event never shows
 * twice. This handler has no effect on background/killed-app delivery —
 * that's the real OS push notification, exactly as the phase spec
 * requires.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// OS-level quick-action pre-architecture (2026-08-23 redesign): registers
// the category so a booking_requested push (server sets categoryId:
// 'RIDE_REQUEST', expo-push.ts) can render Accepter/Refuser buttons
// directly on the notification. Deliberately `opensAppToForeground: true`
// on both actions rather than a true background quick-action — actually
// accepting/declining without opening the app needs a background handler
// that can fire an authenticated API call on its own, which is real,
// separate work this pass doesn't build (same category as this codebase's
// already-documented "on-device push delivery unverified" gap). Tapping
// either button today just opens the app to the request, same as tapping
// the notification body — the category exists so the buttons are visually
// present and wired for that real handler to slot in later without
// touching this registration again.
void Notifications.setNotificationCategoryAsync('RIDE_REQUEST', [
  {
    identifier: 'ACCEPT_RIDE',
    buttonTitle: 'Accepter',
    options: { opensAppToForeground: true },
  },
  {
    identifier: 'DECLINE_RIDE',
    buttonTitle: 'Refuser',
    options: { opensAppToForeground: true, isDestructive: true },
  },
]);

export function currentDevicePlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

/** Android 8+ requires a channel for any notification to show at all. A
 *  no-op on iOS/web. Safe to call unconditionally and repeatedly — channel
 *  creation is idempotent. */
export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function getPushPermissionStatus(): Promise<Notifications.PermissionStatus> {
  const settings = await Notifications.getPermissionsAsync();
  return settings.status;
}

export async function requestPushPermission(): Promise<Notifications.PermissionStatus> {
  const settings = await Notifications.requestPermissionsAsync();
  return settings.status;
}

/**
 * Resolves the Expo push token for this device. Returns `null` (never
 * throws) on failure — real push credentials (EAS project id, APNs/FCM
 * certificates) are a genuine external-service setup step this sandboxed
 * environment cannot complete (see this phase's final report), so a
 * missing/failed token must degrade to "no push for this device," not a
 * crash, exactly like lib/routing.ts's OSRM-unavailable fallback pattern.
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return token.data;
  } catch {
    return null;
  }
}
