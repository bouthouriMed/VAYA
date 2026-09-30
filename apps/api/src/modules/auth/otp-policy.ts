import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * One-time-code policy (docs/security/security-audit.md VAYA-SEC-002). Kept
 * free of any DB/network dependency so every rule is unit-testable.
 *
 * The threat: a 6-digit code has 1,000,000 possibilities. Before this policy
 * a phone could accumulate many simultaneously-valid codes (each "resend"
 * added one), each guessable without limit until its 5-minute TTL — and the
 * per-phone request/verify rate limits were not actually keyed by phone (see
 * lib/rate-limit.ts). Guessing a victim's code was a matter of volume.
 */

/** A code is valid for this long. */
export const OTP_TTL_MINUTES = 5;

/** Wrong guesses allowed against one specific code before it is dead. */
export const OTP_MAX_ATTEMPTS_PER_CODE = 5;

/** Sliding window over which guesses are counted across ALL codes for a phone. */
export const OTP_LOCKOUT_WINDOW_MINUTES = 15;

/** Guesses allowed per phone per window (across resends) before the phone is
 *  locked out of both requesting and verifying codes until the window passes.
 *  10 guesses / 15 min ⇒ at most ~960 guesses a day against a 1,000,000-code
 *  space: under 0.1% per day per targeted number, versus effectively
 *  unbounded before. */
export const OTP_MAX_ATTEMPTS_PER_WINDOW = 10;

/** HMAC-SHA256 of `phone:code` keyed with the server secret. Stored instead
 *  of the code, so a database read / backup / SQL-injection leak does not
 *  yield live login codes, and a hash computed for one phone is useless for
 *  another. */
export function hashOtpCode(secret: string, phone: string, code: string): string {
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function otpHashesMatch(expectedHex: string, providedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(providedHex, 'hex');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/** True once a phone has burned its guess budget for the current window. */
export function isOtpLockedOut(attemptsInWindow: number): boolean {
  return attemptsInWindow >= OTP_MAX_ATTEMPTS_PER_WINDOW;
}
