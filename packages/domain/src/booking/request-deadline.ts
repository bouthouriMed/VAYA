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
