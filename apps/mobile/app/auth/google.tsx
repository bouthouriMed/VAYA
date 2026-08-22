import { useEffect } from 'react';
import { router } from 'expo-router';

/**
 * Real fallback landing pad for the Google OAuth deep link
 * (`vaya://auth/google`, or Expo Go's `exp://<host>:<port>/--/auth/google`)
 * — normally never actually reached: `expo-web-browser`'s
 * `openAuthSessionAsync` (`src/services/auth/googleAuth.ts`) is supposed to
 * intercept this redirect internally and resolve its own promise before the
 * OS ever delivers it as a real in-app navigation. iOS's
 * `ASWebAuthenticationSession` does this reliably; Android's Custom-Tabs-
 * based implementation doesn't always suppress the underlying deep link, so
 * the router can receive it as a genuine *push* on top of whatever screen
 * the user was actually on — without a registered route here, that showed
 * "Unmatched Route" on Android (iOS unaffected), confirmed live on a real
 * device.
 *
 * Deliberately does NOT redirect anywhere fixed (an earlier version of this
 * file did `<Redirect href="/(tabs)/explore" />`, which "fixed" the error
 * screen by replacing it with something worse: it silently yanked the user
 * to Explore even mid-booking or mid-publish, and left a stray grey overlay
 * behind — the real screen's own ContextualAuthSheet never got to complete
 * its own close/resume lifecycle because this competing navigation
 * interrupted it). The actual ticket exchange and sign-in already happen
 * through `openAuthSessionAsync`'s resolved promise
 * (`ContextualAuthSheet.tsx` / `sign-in.tsx`'s `continueWithGoogle`) on the
 * screen the user was already on — this route's only job is to get out of
 * the way, popping itself off so that screen (and its sheet) resume
 * normally underneath.
 */
export default function GoogleAuthDeepLinkFallback(): null {
  useEffect(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      // Only reachable in practice via a cold app launch straight into this
      // deep link (no screen underneath to pop back to) — explore is the
      // same guest-safe default index.tsx itself redirects to.
      router.replace('/(tabs)/explore');
    }
  }, []);
  return null;
}
