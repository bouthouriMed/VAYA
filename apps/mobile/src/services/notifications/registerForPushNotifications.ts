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
 * Contextual push-permission request + token registration. Call this only
 * from a moment that already gives the user a reason (a driver's first
 * ride publish, a passenger's first booking request) — never on cold
 * start, per docs/roadmap/phase-07-notifications.md's UX behavior section.
 *
 * Prompts at most once per install: the SecureStore flag in
 * pushPermissionStorage.ts remembers the outcome, so whichever of the two
 * trigger points (driver/publish.tsx, search/trust.tsx) fires first "wins"
 * and the other becomes a silent no-op.
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
