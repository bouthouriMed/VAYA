/**
 * Server-authoritative request response deadline (spec §20 — matrix M-050,
 * M-054, EDGE-deadline-1/2): "Every request has a server-authoritative
 * response deadline, visible to passenger immediately post-request and to
 * driver inside the incoming request." VAYA operational policy (spec §28)
 * — a first-cut default, not a settled product number. Reuses the value
 * `apps/mobile/app/bookings/confirmed.tsx`'s pre-existing countdown UI
 * already displayed to passengers (`REQUEST_WINDOW_MS = 7 * 60_000`,
 * previously "a UI cue... no backend expiry policy exists yet") — the
 * backend now actually enforces what that countdown always implied,
 * rather than inventing an unrelated number.
 *
 * Pure module: no I/O, no wall-clock reads — callers supply `requestedAt`/
 * `now` explicitly (deterministic-clock discipline).
 */
export const BOOKING_REQUEST_RESPONSE_WINDOW_MINUTES = 7;

export function computeBookingExpiresAt(
  requestedAt: Date,
  windowMinutes: number = BOOKING_REQUEST_RESPONSE_WINDOW_MINUTES,
): Date {
  return new Date(requestedAt.getTime() + windowMinutes * 60_000);
}

export function hasBookingRequestExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

/**
 * M-113 (spec §39, "request deadline approaching"). Scaled to the response
 * window itself, not a fixed absolute number — `BOOKING_REQUEST_RESPONSE_
 * WINDOW_MINUTES`'s own 7-minute default makes a fixed 10/15-minute lead
 * (a plausible choice for a longer SLA) meaningless here, since it would
 * always report "approaching" from the very moment the request was made.
 * Injectable override, same M-085a pattern as the rest of this suite's
 * policy thresholds.
 */
export const DEADLINE_APPROACHING_LEAD_MINUTES = 2;

export function isDeadlineApproaching(
  expiresAt: Date,
  now: Date,
  leadMinutes: number = DEADLINE_APPROACHING_LEAD_MINUTES,
): boolean {
  const msRemaining = expiresAt.getTime() - now.getTime();
  return msRemaining > 0 && msRemaining <= leadMinutes * 60_000;
}
