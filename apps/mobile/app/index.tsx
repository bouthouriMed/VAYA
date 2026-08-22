import { Redirect } from 'expo-router';

/**
 * The app's entry route now opens straight into guest-browsable search for
 * everyone — signed in or not. Sign-in is no longer a mandatory front door:
 * a guest can search, view results, and open ride details, and a driver can
 * fill in the publish form, all without an account. Auth only interrupts at
 * the two real commit points (Demander une place; the publish form's
 * Continuer), via ContextualAuthSheet (src/features/auth/) — never here.
 * The full sign-in screen this route used to render inline moved to
 * app/sign-in.tsx, still reachable explicitly (proactively, or as a
 * fallback for something that genuinely needs an account).
 */
export default function IndexRedirect(): React.JSX.Element {
  return <Redirect href="/(tabs)/explore" />;
}
