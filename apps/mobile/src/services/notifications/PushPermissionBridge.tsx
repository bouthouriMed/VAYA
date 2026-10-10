import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAppSelector } from '../../state/store';
import { useRegisterPushTokenMutation } from '../../state/api';
import { requestPushPermissionAndRegister } from './registerForPushNotifications';

/**
 * Keeps this device registered for push while a user is signed in. Mounted
 * once at the app root (app/_layout.tsx).
 *
 * Runs on every sign-in (each new session, so switching accounts moves the
 * token to the new user) and again whenever the app returns to the
 * foreground until a registration has succeeded — that covers a user who
 * turned notifications on in system settings after first refusing, and a
 * registration that failed on a flaky network. The OS dialog itself is
 * still shown at most once (pushPermission.ts).
 */
export function PushPermissionBridge(): null {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const isAuthenticated = Boolean(accessToken);
  const [registerPushToken] = useRegisterPushTokenMutation();
  const registered = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      registered.current = false;
      return;
    }

    const attempt = (): void => {
      if (registered.current || inFlight.current) return;
      inFlight.current = true;
      void requestPushPermissionAndRegister((args) => registerPushToken(args).unwrap()).then(
        (ok) => {
          registered.current = ok;
          inFlight.current = false;
        },
      );
    };

    attempt();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') attempt();
    });
    return () => subscription.remove();
  }, [isAuthenticated, registerPushToken]);

  return null;
}
