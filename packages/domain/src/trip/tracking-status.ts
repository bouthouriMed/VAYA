import type { TripStatus } from './trip-status';

// Live tracking (docs/domain/live-tracking.md). Deliberately orthogonal to
// `TripStatus`: TripStatus is the ride-progress state machine (where the
// trip is in scheduled -> ... -> completed), while TrackingStatus is the
// *GPS feed's own health* — a trip can be `active` while its tracking feed
// is `stale` (driver's phone lost signal) or `unavailable` (no fix for a
// while). Never conflate the two: a UI must never show a moving marker or a
// "live" badge from data older than STALE_AFTER_MS just because the trip
// status still says `active`.
export const TRACKING_STATUSES = [
  'not_started',
  'starting',
  'live',
  'stale',
  'unavailable',
  'completed',
] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

const TRIP_STATUSES_WITH_TRACKING: readonly TripStatus[] = [
  'driver_approaching',
  'pickup',
  'active',
  'arriving',
];

const TERMINAL_TRIP_STATUSES: readonly TripStatus[] = ['completed', 'no_show', 'cancelled'];

// A fix is "live" if it arrived within this window. The mobile client is
// expected to send an update roughly every 6-10s while tracking is active
// (see docs/domain/live-tracking.md's throttling policy) — this allows one
// or two missed pings before downgrading the UI's confidence.
export const TRACKING_LIVE_AFTER_MS = 25_000;
// Beyond this, treat the feed as genuinely gone rather than merely lagging —
// the UI must switch to an honest "tracking unavailable" state, never keep
// showing a stale marker as if it were current.
export const TRACKING_STALE_AFTER_MS = 90_000;

export interface DeriveTrackingStatusInput {
  tripStatus: TripStatus;
  locationUpdatedAt: Date | null;
  now: Date;
}

export function deriveTrackingStatus(input: DeriveTrackingStatusInput): TrackingStatus {
  const { tripStatus, locationUpdatedAt, now } = input;

  if (TERMINAL_TRIP_STATUSES.includes(tripStatus)) return 'completed';
  if (!TRIP_STATUSES_WITH_TRACKING.includes(tripStatus)) return 'not_started';
  if (!locationUpdatedAt) return 'starting';

  const ageMs = now.getTime() - locationUpdatedAt.getTime();
  if (ageMs < 0) return 'live'; // clock skew guard — never report a future fix as stale
  if (ageMs <= TRACKING_LIVE_AFTER_MS) return 'live';
  if (ageMs <= TRACKING_STALE_AFTER_MS) return 'stale';
  return 'unavailable';
}
