import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../../lib/database.js';
import { getEnv } from '../../config/env.js';
import { loginWithGoogleCode, issueOauthTicket } from './auth.service.js';

const DEFAULT_APP_DEEP_LINK = 'vaya://auth/google';

// Every legitimate caller of /auth/google/start is one of these three
// schemes (apps/mobile/src/services/auth/googleAuth.ts's `Linking.createURL`
// call resolves to exactly one of them, depending on runtime):
//   vaya://          — a real standalone/production build (app.config.js's
//                      `scheme: 'vaya'`)
//   exp://           — Expo Go (dynamic <host>:<port>, can't be a fixed
//                      literal, so this only checks the scheme prefix)
//   exp+vaya://      — a custom dev-client build (Expo's own documented
//                      `exp+<scheme>://` convention for dev clients)
// Anything else (in particular another app's arbitrary custom scheme) is
// rejected outright rather than merely "not http(s)" — a previous version
// of this check only blocked http(s), which would have handed the one-time
// OAuth ticket to any other installed app that happened to register a
// colliding custom URL scheme.
const ALLOWED_APP_REDIRECT_SCHEMES = [/^vaya:\/\//i, /^exp:\/\//i, /^exp\+vaya:\/\//i];

/**
 * The app's actual return deep link isn't a fixed constant — see the scheme
 * list above for why. /auth/google/start accepts the caller's real redirect
 * URI and threads it through the signed `state` round-trip so the callback
 * can send the browser back to the exact URL the app is actually listening
 * on, but only ever to one of the allowlisted schemes — never an arbitrary
 * caller-supplied value.
 */
export function sanitizeAppRedirectUri(candidate: unknown): string {
  if (
    typeof candidate === 'string' &&
    candidate.length > 0 &&
    ALLOWED_APP_REDIRECT_SCHEMES.some((pattern) => pattern.test(candidate))
  ) {
    return candidate;
  }
  return DEFAULT_APP_DEEP_LINK;
}

/**
 * Registered UNPREFIXED (not under API_PREFIX): Google itself redirects the
 * browser to GOOGLE_CALLBACK_URL, which is a fixed, GCP-registered URL this
 * app doesn't control the shape of — it must match exactly, prefix and all.
 * server.ts binds a second listener on this URL's port so it resolves
 * regardless of which port the rest of the API runs on.
 */
export async function googleOAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDatabase();

  fastify.get('/auth/google/start', async (request, reply) => {
    const env = getEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CALLBACK_URL) {
      reply.code(501).send({ message: 'Google sign-in is not configured' });
      return;
    }

    const query = request.query as { redirect_uri?: string };
    const appRedirectUri = sanitizeAppRedirectUri(query.redirect_uri);

    // Stateless CSRF guard: a short-lived signed token instead of a
    // server-side session (there is no session yet at this point). The JWT
    // payload shape is fixed app-wide to `{ sub: string }`, so the caller's
    // redirect URI rides along inside `sub` itself (`marker:<uri>`) rather
    // than as a second claim — still fully protected by the signature, since
    // any tampering invalidates it.
    const state = fastify.jwt.sign(
      { sub: `google_oauth_state:${appRedirectUri}` },
      { expiresIn: '5m' },
    );
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  fastify.get('/auth/google/callback', async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };

    // Best-effort recovery of the real app redirect URI even on an error
    // path, so a failure still lands back in the app instead of stranding
    // the user in the browser — falls back to the default scheme only if
    // `state` itself couldn't be verified at all.
    let appRedirectUri = DEFAULT_APP_DEEP_LINK;
    if (query.state) {
      try {
        const decoded = fastify.jwt.verify<{ sub: string }>(query.state);
        const marker = 'google_oauth_state:';
        if (decoded.sub.startsWith(marker)) {
          appRedirectUri = sanitizeAppRedirectUri(decoded.sub.slice(marker.length));
        }
      } catch {
        // Invalid/expired state — appRedirectUri stays the default; the
        // rejection below still fires from the main try/catch.
      }
    }

    if (query.error) {
      reply.redirect(`${appRedirectUri}?status=error&reason=${encodeURIComponent(query.error)}`);
      return;
    }

    try {
      if (!query.state) throw new Error('missing_state');
      fastify.jwt.verify(query.state);
      if (!query.code) throw new Error('missing_code');

      const userId = await loginWithGoogleCode(db, query.code);
      const ticket = await issueOauthTicket(db, userId);
      reply.redirect(`${appRedirectUri}?status=success&ticket=${encodeURIComponent(ticket)}`);
    } catch (err) {
      fastify.log.warn({ err }, 'Google OAuth callback failed');
      reply.redirect(`${appRedirectUri}?status=error`);
    }
  });
}
