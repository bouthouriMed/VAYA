import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

function getApiOrigin(): string {
  const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra;
  const base: string = extra?.apiBaseUrl ?? 'http://localhost:3000/api/v1';
  // /auth/google/start and /auth/google/callback are registered unprefixed
  // (see apps/api/src/app.ts) — google-auth.routes.ts's own comment explains
  // why: the callback URL is fixed by what's registered in Google Cloud
  // Console, which doesn't know about this app's /api/v1 convention.
  return base.replace(/\/api\/v1\/?$/, '');
}

export type GoogleSignInResult =
  | { status: 'success'; ticket: string }
  | { status: 'cancelled' }
  | { status: 'error'; reason?: string };

/**
 * Opens Google's consent screen in an in-app browser and waits for the
 * backend's OAuth callback to redirect back into the app via the `vaya://`
 * deep link. The backend (not this function) holds the OAuth client secret
 * and does the actual code exchange — this only ever sees a short-lived,
 * single-use ticket, never a Google token.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  // Not a fixed `vaya://...` literal: in Expo Go this resolves to Expo Go's
  // own dynamic `exp://<host>:<port>/--/...` URL, not the app's real custom
  // scheme (Expo Go doesn't own that scheme — only a dev-client/standalone
  // build does). The backend has to redirect back to this exact value, so
  // it's passed along as a query param rather than assumed server-side.
  const redirectUri = Linking.createURL('auth/google');
  const startUrl = `${getApiOrigin()}/auth/google/start?redirect_uri=${encodeURIComponent(redirectUri)}`;

  const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);
  if (result.type !== 'success' || !result.url) {
    return { status: 'cancelled' };
  }

  const parsed = Linking.parse(result.url);
  const { status, ticket, reason } = parsed.queryParams ?? {};

  if (status === 'success' && typeof ticket === 'string') {
    return { status: 'success', ticket };
  }
  return { status: 'error', reason: typeof reason === 'string' ? reason : undefined };
}
