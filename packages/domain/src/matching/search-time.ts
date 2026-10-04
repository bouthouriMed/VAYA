/**
 * Which rides a search for a given time shows, and which of them count as
 * "at the requested time". A passenger asking for 15:00 sees every ride
 * that day (not only 11:00-19:00), with the rides around 15:00 first —
 * the requested time is the priority, the rest of the day the fallback.
 */

/** A ride whose pickup is within this many minutes of the requested time
 *  is "at your time": listed before every other ride that day. */
export const NEAR_REQUESTED_TIME_MIN = 90;

/** Rides around the requested time are always included, even across
 *  midnight (a 23:30 search still sees a 00:45 ride). */
export const MIN_SEARCH_WINDOW_MIN = 240;

/** A ride that left more than this long ago is never offered. */
export const DEPARTED_GRACE_MIN = 5;

const MINUTE_MS = 60_000;

export function isNearRequestedTime(pickupAt: Date, requestedAt: Date): boolean {
  return (
    Math.abs(pickupAt.getTime() - requestedAt.getTime()) <= NEAR_REQUESTED_TIME_MIN * MINUTE_MS
  );
}

/** Offset of `timeZone` from UTC at `date`, in ms (positive east of UTC). */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Start (inclusive) and end (exclusive) of the local calendar day that
 *  contains `date` in `timeZone`. */
export function localDayBounds(date: Date, timeZone: string): { start: Date; end: Date } {
  const local = new Date(date.getTime() + timeZoneOffsetMs(date, timeZone));
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const midnightAt = (dayOffset: number): Date => {
    const guess = Date.UTC(y, m, d + dayOffset);
    // Re-read the offset at the guess itself, in case the zone changes
    // offset (DST) between `date` and that midnight.
    return new Date(
      guess - timeZoneOffsetMs(new Date(guess - timeZoneOffsetMs(date, timeZone)), timeZone),
    );
  };
  return { start: midnightAt(0), end: midnightAt(1) };
}

/**
 * Departure window for a search: the whole local day of the requested time,
 * widened to at least ±MIN_SEARCH_WINDOW_MIN around it, and never earlier
 * than rides that have actually already left.
 */
export function searchTimeWindow(params: { requestedAt: Date; now: Date; timeZone: string }): {
  start: Date;
  end: Date;
} {
  const { requestedAt, now, timeZone } = params;
  const day = localDayBounds(requestedAt, timeZone);
  const around = MIN_SEARCH_WINDOW_MIN * MINUTE_MS;
  const start = Math.max(
    Math.min(day.start.getTime(), requestedAt.getTime() - around),
    now.getTime() - DEPARTED_GRACE_MIN * MINUTE_MS,
  );
  const end = Math.max(day.end.getTime() - 1, requestedAt.getTime() + around);
  return { start: new Date(start), end: new Date(end) };
}
