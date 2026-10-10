import {
  currentDevicePlatform,
  ensureAndroidNotificationChannel,
  getExpoPushToken,
  getPushPermissionStatus,
  requestPushPermission,
} from './notificationClient';
import { shouldPromptForPushPermission } from './pushPermission';
import { trackEvent } from '../analytics/analytics';
import { captureException } from '../monitoring/sentry';

export interface RegisterPushTokenArgs {
  token: string;
  platform: 'ios' | 'android';
}

export type RegisterPushTokenFn = (args: RegisterPushTokenArgs) => Promise<unknown>;

/**
 * Makes sure the signed-in user's device is registered for push. Called by
 * PushPermissionBridge.tsx on every authenticated app start / account
 * switch, and after a first ride publish or booking request.
 *
 * Two separate concerns:
 *  - the OS permission dialog is shown at most once (only while the OS
 *    status is still 'undetermined' — pushPermission.ts);
 *  - token registration runs EVERY time permission is granted. Registering
 *    only right after the dialog (the previous behavior) meant a token was
 *    never re-sent after a reinstall, a token rotation, a failed first
 *    attempt, or signing in to another account — so the server had no
 *    token, or the wrong user's, and pushes silently went nowhere. The
 *    server upserts by token, so repeating this is cheap and idempotent.
 *
 * `registerPushToken` is injected (the RTK Query mutation trigger) to keep
 * this framework-agnostic and testable. Never throws: the calling flow
 * (sign-in, publish, booking) has already succeeded by the time this runs.
 * Resolves true once the server has this device's token.
 */
export async function requestPushPermissionAndRegister(
  registerPushToken: RegisterPushTokenFn,
): Promise<boolean> {
  try {
    let status = await getPushPermissionStatus();
    // Expo Go on Android has no push support at all (notificationsModule.ts).
    if (status === 'unavailable') return false;

    if (shouldPromptForPushPermission(status)) {
      status = await requestPushPermission();
      trackEvent(status === 'granted' ? 'push_permission_granted' : 'push_permission_denied');
    }
    if (status !== 'granted') return false;

    await ensureAndroidNotificationChannel();

    const platform = currentDevicePlatform();
    const token = await getExpoPushToken();
    if (!token || !platform) return false;

    await registerPushToken({ token, platform });
    return true;
  } catch (err) {
    // Reported, not swallowed: a failure here is exactly the "push silently
    // doesn't work" case, and the only place it's visible is monitoring.
    captureException(err);
    return false;
  }
}

/**
 * Detaches this device from the signed-in account (logout). Must run while
 * the session is still valid. Best-effort: a failure only means the old
 * account may keep getting pushes on this device until the token is
 * re-registered by the next sign-in, which reassigns it server-side.
 */
export async function unregisterThisDevice(
  unregisterPushToken: (args: { token: string }) => Promise<unknown>,
): Promise<void> {
  try {
    const status = await getPushPermissionStatus();
    if (status !== 'granted') return;
    const token = await getExpoPushToken();
    if (!token) return;
    await unregisterPushToken({ token });
  } catch (err) {
    captureException(err);
  }
}
