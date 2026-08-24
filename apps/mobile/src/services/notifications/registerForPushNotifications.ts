import {
  currentDevicePlatform,
  ensureAndroidNotificationChannel,
  getExpoPushToken,
  requestPushPermission,
} from './notificationClient';
import { hasPromptedForPushPermission, markPromptedForPushPermission } from './pushPermissionStorage';
import { shouldPromptForPushPermission } from './pushPermission';
import { trackEvent } from '../analytics/analytics';

export interface RegisterPushTokenArgs {
  token: string;
  platform: 'ios' | 'android';
}

export type RegisterPushTokenFn = (args: RegisterPushTokenArgs) => Promise<unknown>;

/**
 * Push-permission request + token registration. Called from
 * PushPermissionBridge.tsx as soon as the user is authenticated — the
 * app's current, explicit timing choice, prompting upfront rather than
 * waiting for a contextual moment (this function's original design,
 * documented in phase-07-notifications.md's UX behavior section — now
 * superseded by product direction).
 *
 * Prompts at most once per install: the SecureStore flag in
 * pushPermissionStorage.ts remembers the outcome, so whichever trigger
 * point fires first "wins" and the rest (PushPermissionBridge,
 * driver/publish.tsx, search/ride-details.tsx) become silent no-ops.
 *
 * `registerPushToken` is injected (the RTK Query mutation trigger from
 * state/api.ts) rather than imported directly, keeping this function
 * framework-agnostic and independently testable.
 */
export async function requestPushPermissionAndRegister(
  registerPushToken: RegisterPushTokenFn,
): Promise<void> {
  const alreadyPrompted = await hasPromptedForPushPermission();
  if (!shouldPromptForPushPermission(alreadyPrompted)) return;

  await markPromptedForPushPermission();

  const status = await requestPushPermission();
  if (status !== 'granted') {
    trackEvent('push_permission_denied');
    return;
  }
  trackEvent('push_permission_granted');

  await ensureAndroidNotificationChannel();

  const platform = currentDevicePlatform();
  const token = await getExpoPushToken();
  if (!token || !platform) return;

  try {
    await registerPushToken({ token, platform });
  } catch {
    // Registration failing must never affect the flow that triggered this
    // call — the ride publish / booking request has already succeeded by
    // the time this runs (both call sites invoke this after their own
    // success path, never blocking on it).
  }
}
