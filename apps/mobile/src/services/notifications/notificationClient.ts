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
