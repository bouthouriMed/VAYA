/**
 * The 24-hour post-trip rating submission window (Phase 9 —
 * docs/roadmap/phase-09-ratings-trust.md, mirroring the benchmark). Pure
 * logic, no I/O — the caller (apps/api's ratings.service.ts) supplies
 * `trips.completedAt` and the current time.
 */

export const RATING_WINDOW_HOURS = 24;
export const RATING_WINDOW_MS = RATING_WINDOW_HOURS * 60 * 60 * 1000;

/** Inclusive at the exact boundary — a rating submitted at precisely +24h00m00s is still valid. */
export function isWithinRatingWindow(completedAt: Date, now: Date = new Date()): boolean {
  const elapsedMs = now.getTime() - completedAt.getTime();
  return elapsedMs >= 0 && elapsedMs <= RATING_WINDOW_MS;
}

export function ratingWindowExpiresAt(completedAt: Date): Date {
  return new Date(completedAt.getTime() + RATING_WINDOW_MS);
}
