import { useEffect, useRef } from 'react';
import { useAppSelector } from '../../state/store';
import { useRegisterPushTokenMutation } from '../../state/api';
import { requestPushPermissionAndRegister } from './registerForPushNotifications';

/**
 * Asks for push permission as soon as the user is authenticated — the
 * very first opportunity there's actually a user to register a token
 * for, rather than waiting for a driver's first ride publish or a
 * passenger's first booking (this project's original, more conservative
 * timing — see registerForPushNotifications.ts's doc comment, now
 * superseded by explicit product direction to ask upfront instead).
 *
 * Mounted once at the app root (app/_layout.tsx), same placement as
 * RatingPromptBridge/RecurringPatternPromptBridge. requestPushPermissionAndRegister
 * still only ever prompts once per install (pushPermissionStorage.ts's
 * flag) — driver/publish.tsx's and search/ride-details.tsx's own calls
 * are left in place as harmless no-op fallbacks for the rare case this
 * bridge's prompt never resolved (e.g. the app was backgrounded before
 * the OS dialog rendered).
 */
export function PushPermissionBridge(): null {
  const isAuthenticated = useAppSelector((s) => Boolean(s.auth.accessToken));
  const [registerPushToken] = useRegisterPushTokenMutation();
  const attempted = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || attempted.current) return;
    attempted.current = true;
    void requestPushPermissionAndRegister((args) => registerPushToken(args).unwrap());
  }, [isAuthenticated, registerPushToken]);

  return null;
}
