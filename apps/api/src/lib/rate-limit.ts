import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

/**
 * Named per-route abuse limits (docs/security/security-hardening.md §Rate
 * limiting). Each is an explicit security control with a stated reason, not
 * an arbitrary product number:
 *  - "paid upstream" routes proxy to metered third-party APIs (Google
 *    Places/Routes, Twilio) — the limit bounds the bill an anonymous caller
 *    can run up;
 *  - "write" routes create rows other users see or are notified about — the
 *    limit bounds spam;
 *  - "expensive" routes run routing/PostGIS work per call.
 * All are applied per client IP via `config.rateLimit` (which the plugin
 * evaluates in `onRequest`, before body parsing) — see `keyedRateLimit` for
 * limits that must key on a body field such as a phone number.
 */
export const RATE_LIMITS = {
  /** SMS is billed per message; also the toll-fraud/"SMS pumping" surface. */
  otpRequestPerIp: { max: 10, timeWindow: '1 minute' },
  otpRequestPerIpHourly: { max: 100, timeWindow: '1 hour' },
  /** Extra tight per phone: an OTP is valid 5 minutes, one is plenty. */
  otpRequestPerPhone: { max: 3, timeWindow: '10 minutes' },
  otpVerifyPerIp: { max: 20, timeWindow: '1 minute' },
  otpVerifyPerPhone: { max: 10, timeWindow: '10 minutes' },
  /** Credential guessing: real admins mistype rarely, attackers constantly. */
  adminLoginPerIp: { max: 20, timeWindow: '10 minutes' },
  adminLoginPerEmail: { max: 5, timeWindow: '10 minutes' },
  tokenRefresh: { max: 30, timeWindow: '1 minute' },
  oauthExchange: { max: 20, timeWindow: '1 minute' },
  /** Anonymous, forwards to Google Places (billed per request/session). */
  geocodingAutocomplete: { max: 60, timeWindow: '1 minute' },
  geocodingPlaceDetails: { max: 30, timeWindow: '1 minute' },
  geocodingReverse: { max: 30, timeWindow: '1 minute' },
  /** Anonymous, PostGIS scans + up to 15 live routing calls per search. */
  matchingSearch: { max: 30, timeWindow: '1 minute' },
  /** Routing-engine calls per request. */
  routingPreview: { max: 30, timeWindow: '1 minute' },
  routeOptions: { max: 20, timeWindow: '1 minute' },
  rideMutation: { max: 20, timeWindow: '1 minute' },
  /** Each accepted request notifies (push + email) another user. */
  bookingCreate: { max: 20, timeWindow: '1 minute' },
  bookingAction: { max: 30, timeWindow: '1 minute' },
  messageSend: { max: 30, timeWindow: '1 minute' },
  reportCreate: { max: 5, timeWindow: '10 minutes' },
  uploadCreate: { max: 20, timeWindow: '1 minute' },
} as const satisfies Record<string, { max: number; timeWindow: string }>;

interface KeyedLimitOptions {
  /** Distinguishes this limiter's counters from every other limiter's. */
  namespace: string;
  max: number;
  timeWindow: string | number;
  /** The identity to count against; nullish falls back to the client IP. */
  key: (request: FastifyRequest) => string | null | undefined;
}

/**
 * A preHandler that rate-limits on a value taken from the *parsed request
 * body* (e.g. the phone number an OTP is being requested for).
 *
 * Why this exists: `@fastify/rate-limit`'s `config.rateLimit` is evaluated in
 * the `onRequest` hook, which runs BEFORE the body is parsed — so a
 * `keyGenerator` that reads `request.body.phone` there always sees
 * `undefined` and silently degrades to keying on the client IP. Every OTP
 * "per-phone" limit in this codebase was therefore really per-IP (and the IP
 * was attacker-chosen while `trustProxy` trusted every hop), which allowed
 * unbounded OTP guessing and SMS pumping. A `preHandler` runs after body
 * parsing and validation, so the key is real.
 *
 * Must be registered on a route with `config: { rateLimit: false }` OR be a
 * *second* layer on top of an IP-keyed `config.rateLimit` — the two use
 * separate counters, so both must pass.
 */
export function keyedRateLimit(app: FastifyInstance, options: KeyedLimitOptions) {
  const check = app.createRateLimit({
    max: options.max,
    timeWindow: options.timeWindow,
    keyGenerator: (request) => `${options.namespace}:${options.key(request) ?? request.ip}`,
  });

  return async function keyedRateLimitHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await check(request);
    // `createRateLimit` reports `isAllowed: true` ONLY for allow-listed keys;
    // every request it actually counts comes back `isAllowed: false` with the
    // real verdict in `isExceeded` (verified against @fastify/rate-limit
    // 10.3.0 — treating `!isAllowed` as "blocked" rejects every request).
    if (!result.isAllowed && result.isExceeded) {
      reply.header('retry-after', String(result.ttlInSeconds));
      // Same phrasing as @fastify/rate-limit's own 429 ("retry in N seconds"):
      // clients (and tests/e2e's requestOtpWithBackoff) parse it to back off.
      throw new AppError(`Rate limit exceeded, retry in ${result.ttlInSeconds} seconds`, 429, 'RATE_LIMITED');
    }
  };
}
