import { Redirect } from 'expo-router';

/**
 * Real fallback landing pad for the Google OAuth deep link
 * (`vaya://auth/google`, or Expo Go's `exp://<host>:<port>/--/auth/google`)
 * — normally never actually reached: `expo-web-browser`'s
 * `openAuthSessionAsync` (`src/services/auth/googleAuth.ts`) is supposed to
 * intercept this redirect internally and resolve its own promise before the
 * OS ever delivers it as a real in-app navigation. iOS's
 * `ASWebAuthenticationSession` does this reliably; Android's Custom-Tabs-
 * based implementation doesn't always suppress the underlying deep link, so
 * the router can receive it as a genuine navigation attempt — without a
 * registered route here, that showed "Unmatched Route" on Android (iOS
 * unaffected), confirmed live on a real device. This route makes that
 * landing harmless. The actual ticket exchange still happens through
 * `openAuthSessionAsync`'s resolved promise (`ContextualAuthSheet.tsx` /
 * `sign-in.tsx`'s `continueWithGoogle`), not here — by the time (if ever)
 * this route renders, that has typically already run, which is why even
 * before this fix "go back" already showed a signed-in session.
 */
export default function GoogleAuthDeepLinkFallback(): React.JSX.Element {
  return <Redirect href="/(tabs)/explore" />;
}
