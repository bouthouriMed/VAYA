import { deriveBookingPhase } from '@vaya/domain';
import type { Booking, MyRide, PendingRating } from '../../state/api';

/**
 * The trips tab's model ("Mes trajets", direction C): every drive and every
 * reservation as one kind of item, with one status that already accounts
 * for the clock and the live trip, plus the rules for what goes on top.
 * Pure — no React, no network — so every case is unit-tested.
 *
 * Statuses come only from what the server returned (ride status, booking
 * status, trip status) and the clock; nothing is guessed. "En cours" in
 * particular only ever comes from a real started trip.
 */

export type TripRole = 'driver' | 'passenger';

export type AgendaStatus =
  // Driver, before the ride is live for passengers.
  | 'draft'
  | 'awaiting_verification'
  // Driver: published (or full), departure still ahead.
  | 'scheduled'
  // Passenger: request sent, driver hasn't answered.
  | 'awaiting_response'
  // Passenger: seat confirmed, departure still ahead.
  | 'confirmed'
  // Either: departure time passed, nobody has started the trip.
  | 'departure_passed'
  // Driver: the ride is under way.
  | 'driving'
  // Passenger, live: started but no trip detail yet, then the trip's phases.
  | 'trip_started'
  | 'driver_on_the_way'
  | 'driver_at_pickup'
  | 'on_board'
  | 'arriving'
  // Finished.
  | 'completed'
  | 'cancelled'
  | 'cancelled_by_you'
  | 'cancelled_by_driver'
  | 'declined'
  | 'expired'
  | 'superseded'
  | 'no_show'
  | 'not_published';

export const LIVE_STATUSES: readonly AgendaStatus[] = [
  'driving',
  'trip_started',
  'driver_on_the_way',
  'driver_at_pickup',
  'on_board',
  'arriving',
];

const FINISHED_STATUSES: readonly AgendaStatus[] = [
  'completed',
  'cancelled',
  'cancelled_by_you',
  'cancelled_by_driver',
  'declined',
  'expired',
  'superseded',
  'no_show',
  'not_published',
];

/** A departure that passed this long ago without anyone starting the trip
 *  is no longer "today's business": the server's expiry sweep closes such
 *  rides a few hours after their arrival time, and until it does the item
 *  sits in the history instead of the agenda. */
export const STALE_DEPARTURE_MS = 6 * 60 * 60 * 1000;

/** A trip leaving within this window gets the countdown treatment on top. */
export const SOON_WINDOW_MS = 3 * 60 * 60 * 1000;

/** A trip finished this recently (and not yet rated) takes the top card. */
export const RECENT_RATING_WINDOW_MS = 2 * 60 * 60 * 1000;

/** From this long before departure, a driver with passengers is offered
 *  "Démarrer" straight from the top card. */
export const START_WINDOW_MS = 15 * 60 * 1000;

/** A request deadline this close is urgent. */
export const URGENT_DEADLINE_MS = 30 * 60 * 1000;

/** When a trip has no routed duration, assume this long for overlap checks. */
export const DEFAULT_TRIP_DURATION_MS = 60 * 60 * 1000;

/** Unhurried walking pace, meters per minute. */
const WALK_METERS_PER_MINUTE = 80;

/** Extra minutes to be at the meeting point before the driver. */
export const MEETING_BUFFER_MINUTES = 5;

interface AgendaItemBase {
  /** Unique across both roles: `drive:<rideId>` / `booking:<bookingId>`. */
  key: string;
  rideId: string;
  status: AgendaStatus;
  isFinished: boolean;
  isLive: boolean;
  departureAt: Date;
  /** Only from the ride's real routed duration — never invented. */
  arrivalAt: Date | null;
  originLabel: string;
  destinationLabel: string;
}

export interface DriveItem extends AgendaItemBase {
  role: 'driver';
  ride: MyRide;
  seatsBooked: number;
  pendingRequestCount: number;
  nextRequestExpiresAt: Date | null;
  acceptedBookingCount: number;
}

export interface BookingItem extends AgendaItemBase {
  role: 'passenger';
  booking: Booking;
  /** The request's answer deadline, while it is still pending. */
  requestExpiresAt: Date | null;
}

export type AgendaItem = DriveItem | BookingItem;

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function arrivalFrom(departureAt: Date, durationSec: number | null | undefined): Date | null {
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) return null;
  return new Date(departureAt.getTime() + durationSec * 1000);
}

function isStale(departureAt: Date, now: Date): boolean {
  return now.getTime() - departureAt.getTime() > STALE_DEPARTURE_MS;
}

export function driveStatus(ride: MyRide, now: Date): AgendaStatus {
  const departureAt = new Date(ride.departureAt);
  const departed = now.getTime() >= departureAt.getTime();
  switch (ride.status) {
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'completed':
      return 'completed';
    case 'in_progress':
      return 'driving';
    case 'draft':
      if (departed) return 'not_published';
      return ride.publishOnVerificationAt ? 'awaiting_verification' : 'draft';
    case 'published':
    case 'full':
    default:
      if (!departed) return 'scheduled';
      return isStale(departureAt, now) ? 'expired' : 'departure_passed';
  }
}

export function bookingStatus(booking: Booking, now: Date): AgendaStatus {
  const ride = booking.ride;
  const departureAt = ride ? new Date(ride.departureAt) : null;
  const departed = departureAt != null && now.getTime() >= departureAt.getTime();
  const phase = deriveBookingPhase(booking.status, {
    rideStatus: ride?.status ?? null,
    tripStatus: booking.tripStatus ?? null,
  });

  switch (phase) {
    case 'awaiting_response': {
      // The expiry sweep closes a request at its deadline; between the
      // deadline and the sweep it is already unanswerable.
      const expiresAt = toDate(booking.expiresAt);
      if ((expiresAt && expiresAt.getTime() <= now.getTime()) || departed) return 'expired';
      return 'awaiting_response';
    }
    case 'in_progress':
      switch (booking.tripStatus) {
        case 'driver_approaching':
          return 'driver_on_the_way';
        case 'pickup':
          return 'driver_at_pickup';
        case 'active':
          return 'on_board';
        case 'arriving':
          return 'arriving';
        default:
          return 'trip_started';
      }
    case 'confirmed':
      if (!departed) return 'confirmed';
      return departureAt && isStale(departureAt, now) ? 'expired' : 'departure_passed';
    case 'completed':
      return 'completed';
    case 'declined':
      return 'declined';
    case 'cancelled_by_rider':
      return 'cancelled_by_you';
    case 'cancelled_by_driver':
      return 'cancelled_by_driver';
    case 'expired':
      return 'expired';
    case 'superseded':
      return 'superseded';
    case 'no_show':
      return 'no_show';
    default:
      return 'expired';
  }
}

function withFlags(status: AgendaStatus): { isFinished: boolean; isLive: boolean } {
  return { isFinished: FINISHED_STATUSES.includes(status), isLive: LIVE_STATUSES.includes(status) };
}

export function buildAgendaItems(
  rides: readonly MyRide[],
  bookings: readonly Booking[],
  now: Date = new Date(),
): AgendaItem[] {
  const items: AgendaItem[] = [];

  for (const ride of rides) {
    const departureAt = toDate(ride.departureAt);
    if (!departureAt) continue;
    const status = driveStatus(ride, now);
    items.push({
      key: `drive:${ride.id}`,
      role: 'driver',
      rideId: ride.id,
      ride,
      status,
      ...withFlags(status),
      departureAt,
      arrivalAt: arrivalFrom(departureAt, ride.estimatedDurationSec),
      originLabel: ride.originLabel,
      destinationLabel: ride.destinationLabel,
      seatsBooked: Math.max(0, ride.seatsTotal - ride.seatsAvailable),
      pendingRequestCount: status === 'scheduled' || status === 'departure_passed' ? (ride.pendingRequestCount ?? 0) : 0,
      nextRequestExpiresAt: toDate(ride.nextRequestExpiresAt),
      acceptedBookingCount: ride.acceptedBookingCount ?? 0,
    });
  }

  for (const booking of bookings) {
    const ride = booking.ride;
    const departureAt = toDate(ride?.departureAt);
    if (!ride || !departureAt) continue;
    const status = bookingStatus(booking, now);
    items.push({
      key: `booking:${booking.id}`,
      role: 'passenger',
      rideId: booking.rideId,
      booking,
      status,
      ...withFlags(status),
      departureAt,
      arrivalAt: arrivalFrom(departureAt, ride.estimatedDurationSec),
      // The passenger's own leg, not the driver's whole route.
      originLabel: booking.pickupLabel || ride.originLabel,
      destinationLabel: booking.dropoffLabel ?? ride.destinationLabel,
      requestExpiresAt: status === 'awaiting_response' ? toDate(booking.expiresAt) : null,
    });
  }

  return items;
}

export type SpotlightMoment =
  /** The trip is under way. */
  | 'live'
  /** Driver: departure passed, passengers are waiting for "Démarrer". */
  | 'needs_start'
  /** Passenger: departure passed, the driver hasn't started yet. */
  | 'waiting_driver'
  /** Driver with passengers, departure within START_WINDOW_MS. */
  | 'start_window'
  /** Leaves within SOON_WINDOW_MS. */
  | 'soon'
  /** The next trip, further out. */
  | 'next';

export type Spotlight =
  | { kind: 'trip'; item: AgendaItem; moment: SpotlightMoment }
  | { kind: 'rating'; rating: PendingRating };

const byDeparture = (a: AgendaItem, b: AgendaItem): number => a.departureAt.getTime() - b.departureAt.getTime();

/** A drive whose departure passed with confirmed passengers on board the
 *  booking list — the driver has to start it (or cancel). */
function needsStart(item: AgendaItem): boolean {
  return item.role === 'driver' && item.status === 'departure_passed' && item.acceptedBookingCount > 0;
}

function isRecentRating(rating: PendingRating | null | undefined, now: Date): rating is PendingRating {
  const completedAt = toDate(rating?.completedAt);
  return completedAt != null && now.getTime() - completedAt.getTime() <= RECENT_RATING_WINDOW_MS;
}

/**
 * The one card on top: whatever matters most right now, whatever the role.
 * Order: a live trip, then a missed start (driver must start / passenger is
 * waiting), then a trip leaving within three hours, then a trip that just
 * ended and wasn't rated, then simply the next departure. Unpublished
 * drafts never take it — they're not a trip anyone is waiting on.
 */
export function selectSpotlight(
  items: readonly AgendaItem[],
  pendingRating: PendingRating | null | undefined,
  now: Date = new Date(),
): Spotlight | null {
  const active = items.filter((item) => !item.isFinished).sort(byDeparture);

  const live = active.find((item) => item.isLive);
  if (live) return { kind: 'trip', item: live, moment: 'live' };

  const missedStart = active.find(
    (item) => needsStart(item) || (item.role === 'passenger' && item.status === 'departure_passed'),
  );
  if (missedStart) {
    return { kind: 'trip', item: missedStart, moment: missedStart.role === 'driver' ? 'needs_start' : 'waiting_driver' };
  }

  const upcoming = active.filter(
    (item) => item.status !== 'draft' && item.status !== 'departure_passed' && item.departureAt.getTime() > now.getTime(),
  );
  const next = upcoming[0];
  if (next && next.departureAt.getTime() - now.getTime() <= SOON_WINDOW_MS) {
    const canStart =
      next.role === 'driver' &&
      next.acceptedBookingCount > 0 &&
      next.departureAt.getTime() - now.getTime() <= START_WINDOW_MS;
    return { kind: 'trip', item: next, moment: canStart ? 'start_window' : 'soon' };
  }

  if (isRecentRating(pendingRating, now)) return { kind: 'rating', rating: pendingRating };

  if (next) return { kind: 'trip', item: next, moment: 'next' };
  return null;
}

export type TodoItem =
  | { kind: 'requests'; key: string; item: DriveItem; count: number; expiresAt: Date | null; urgent: boolean }
  | { kind: 'start'; key: string; item: DriveItem }
  | { kind: 'overlap'; key: string; first: AgendaItem; second: AgendaItem }
  | { kind: 'rebook'; key: string; item: BookingItem }
  | { kind: 'rate'; key: string; rating: PendingRating };

/**
 * "À traiter": only things that wait on this person, each with one action.
 * Whatever the top card already asks for isn't repeated here. A request
 * the person sent and is waiting on is not a to-do — that waits on the
 * driver, and its row says so in the agenda.
 */
export function buildTodos(
  items: readonly AgendaItem[],
  pendingRating: PendingRating | null | undefined,
  spotlight: Spotlight | null,
  now: Date = new Date(),
): TodoItem[] {
  const spotlightKey = spotlight?.kind === 'trip' ? spotlight.item.key : null;
  const todos: TodoItem[] = [];

  const drives = items.filter(
    (item): item is DriveItem => item.role === 'driver' && !item.isFinished && item.key !== spotlightKey,
  );

  const withRequests = drives
    .filter((item) => item.pendingRequestCount > 0)
    .sort(
      (a, b) =>
        (a.nextRequestExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY) -
          (b.nextRequestExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY) || byDeparture(a, b),
    );
  for (const item of withRequests) {
    todos.push({
      kind: 'requests',
      key: `requests:${item.rideId}`,
      item,
      count: item.pendingRequestCount,
      expiresAt: item.nextRequestExpiresAt,
      urgent: isUrgentDeadline(item.nextRequestExpiresAt, now),
    });
  }

  for (const item of drives.filter(needsStart).sort(byDeparture)) {
    todos.push({ kind: 'start', key: `start:${item.rideId}`, item });
  }

  for (const [first, second] of findOverlaps(items)) {
    // The top card already says it when it's one of the two.
    if (first.key === spotlightKey || second.key === spotlightKey) continue;
    todos.push({ kind: 'overlap', key: `overlap:${first.key}|${second.key}`, first, second });
  }

  for (const item of findRebookCandidates(items, now)) {
    todos.push({ kind: 'rebook', key: `rebook:${item.booking.id}`, item });
  }

  if (pendingRating && spotlight?.kind !== 'rating') {
    todos.push({ kind: 'rate', key: `rate:${pendingRating.tripId}`, rating: pendingRating });
  }

  return todos;
}

export interface DaySection {
  /** Local calendar day, `YYYY-MM-DD`. */
  key: string;
  day: Date;
  /** Days from today: 0 = today, 1 = tomorrow, negative = earlier. */
  offset: number;
  items: AgendaItem[];
}

function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole calendar days between two dates — DST-safe (rounded, not floored). */
function calendarDayOffset(day: Date, today: Date): number {
  return Math.round((localMidnight(day).getTime() - localMidnight(today).getTime()) / 86_400_000);
}

/** The agenda: every trip that isn't finished, except the one on top,
 *  soonest first, one section per calendar day. */
export function groupUpcomingByDay(
  items: readonly AgendaItem[],
  spotlight: Spotlight | null,
  now: Date = new Date(),
): DaySection[] {
  const spotlightKey = spotlight?.kind === 'trip' ? spotlight.item.key : null;
  const upcoming = items.filter((item) => !item.isFinished && item.key !== spotlightKey).sort(byDeparture);

  const sections: DaySection[] = [];
  for (const item of upcoming) {
    const key = localDayKey(item.departureAt);
    let section = sections[sections.length - 1];
    if (!section || section.key !== key) {
      section = { key, day: localMidnight(item.departureAt), offset: calendarDayOffset(item.departureAt, now), items: [] };
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}

export interface MonthSection {
  /** `YYYY-MM`. */
  key: string;
  month: Date;
  items: AgendaItem[];
}

/** History: every finished trip, most recent first, one section per month. */
export function groupHistoryByMonth(items: readonly AgendaItem[]): MonthSection[] {
  const finished = items.filter((item) => item.isFinished).sort((a, b) => byDeparture(b, a));
  const sections: MonthSection[] = [];
  for (const item of finished) {
    const month = new Date(item.departureAt.getFullYear(), item.departureAt.getMonth(), 1);
    const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    let section = sections[sections.length - 1];
    if (!section || section.key !== key) {
      section = { key, month, items: [] };
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}

/** Role chips only help someone who both drives and rides. */
export function hasBothRoles(items: readonly AgendaItem[]): boolean {
  return items.some((item) => item.role === 'driver') && items.some((item) => item.role === 'passenger');
}

/** How often the screen should refresh: fast while a trip is live or about
 *  to start (statuses move on their own), slower otherwise. */
export function pollingIntervalFor(spotlight: Spotlight | null): number {
  if (spotlight?.kind !== 'trip') return 60_000;
  return spotlight.moment === 'next' ? 60_000 : 15_000;
}

export function isUrgentDeadline(deadline: Date | null | undefined, now: Date): boolean {
  if (!deadline) return false;
  const left = deadline.getTime() - now.getTime();
  return left > 0 && left <= URGENT_DEADLINE_MS;
}

function tripEnd(item: AgendaItem): number {
  return (item.arrivalAt ?? new Date(item.departureAt.getTime() + DEFAULT_TRIP_DURATION_MS)).getTime();
}

/** A trip that will happen, is happening, or could still be accepted. */
function isCommitted(item: AgendaItem): boolean {
  return !item.isFinished && item.status !== 'draft';
}

/**
 * Pairs of trips that overlap in time — a seat booked during a drive you
 * published, two seats for the same evening. Requests still waiting count
 * too: better to know before the driver says yes.
 */
export function findOverlaps(items: readonly AgendaItem[]): [AgendaItem, AgendaItem][] {
  const committed = items.filter(isCommitted).sort(byDeparture);
  const pairs: [AgendaItem, AgendaItem][] = [];
  for (let i = 0; i < committed.length; i++) {
    for (let j = i + 1; j < committed.length; j++) {
      const a = committed[i]!;
      const b = committed[j]!;
      if (b.departureAt.getTime() >= tripEnd(a)) break;
      pairs.push([a, b]);
    }
  }
  return pairs;
}

/** Keys of trips that clash with another one. */
export function overlappingKeys(items: readonly AgendaItem[]): Set<string> {
  const keys = new Set<string>();
  for (const [a, b] of findOverlaps(items)) {
    keys.add(a.key);
    keys.add(b.key);
  }
  return keys;
}

/** A trip still this close counts as "the same trip" when deciding whether
 *  the person already found another ride. */
const SAME_TRIP_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Seats that fell through while the person still has to travel: the driver
 * declined or cancelled, or the request expired unanswered, and the
 * departure is still ahead. Not shown once another reservation covers the
 * same time, and never for a trip they cancelled themselves.
 */
export function findRebookCandidates(items: readonly AgendaItem[], now: Date): BookingItem[] {
  const passengers = items.filter((item): item is BookingItem => item.role === 'passenger');
  const active = passengers.filter((item) => !item.isFinished);
  return passengers
    .filter((item) => {
      const fellThrough =
        item.status === 'declined' ||
        item.status === 'cancelled_by_driver' ||
        (item.status === 'expired' && (item.booking.status === 'pending' || item.booking.status === 'expired'));
      if (!fellThrough || item.departureAt.getTime() <= now.getTime()) return false;
      return !active.some(
        (other) =>
          Math.abs(other.departureAt.getTime() - item.departureAt.getTime()) <= SAME_TRIP_WINDOW_MS &&
          sameDestination(other, item),
      );
    })
    .sort(byDeparture)
    // One per departure is enough; the newest request speaks for the trip.
    .filter((item, index, list) => index === 0 || item.departureAt.getTime() !== list[index - 1]!.departureAt.getTime());
}

/** Drop-offs this close are the same place for "did they rebook?". */
const SAME_DESTINATION_RADIUS_M = 15_000;

function destinationPoint(item: BookingItem): { lat: number; lng: number } | null {
  const { booking } = item;
  if (booking.dropoffLat != null && booking.dropoffLng != null) return { lat: booking.dropoffLat, lng: booking.dropoffLng };
  const ride = booking.ride;
  if (ride?.destinationLat != null && ride.destinationLng != null) return { lat: ride.destinationLat, lng: ride.destinationLng };
  return null;
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function sameDestination(a: BookingItem, b: BookingItem): boolean {
  const pa = destinationPoint(a);
  const pb = destinationPoint(b);
  if (pa && pb) return distanceMeters(pa, pb) <= SAME_DESTINATION_RADIUS_M;
  return a.destinationLabel.trim().toLowerCase() === b.destinationLabel.trim().toLowerCase();
}

/** When to leave to walk to the pickup with a few minutes to spare —
 *  only when the walking distance is known. */
export function leaveByTime(item: BookingItem): Date | null {
  const meters = item.booking.pickupWalkMeters;
  if (meters == null || !Number.isFinite(meters) || meters < 50) return null;
  const walkMinutes = Math.ceil(meters / WALK_METERS_PER_MINUTE);
  return new Date(item.departureAt.getTime() - (walkMinutes + MEETING_BUFFER_MINUTES) * 60_000);
}

export interface SearchAgain {
  origin: { label: string; lat: number; lng: number };
  destination: { label: string; lat: number; lng: number };
  /** The original departure if still ahead, else "now". */
  departureAt: Date | null;
  passengers: number;
}

/** The same journey as a fresh search: this passenger's own pickup and
 *  drop-off, same time, same number of seats. */
export function searchAgainTarget(item: BookingItem, now: Date): SearchAgain | null {
  const { booking } = item;
  const ride = booking.ride;
  const destination =
    booking.dropoffLat != null && booking.dropoffLng != null
      ? { label: booking.dropoffLabel ?? ride?.destinationLabel ?? '', lat: booking.dropoffLat, lng: booking.dropoffLng }
      : ride?.destinationLat != null && ride.destinationLng != null
        ? { label: ride.destinationLabel, lat: ride.destinationLat, lng: ride.destinationLng }
        : null;
  if (!destination) return null;
  return {
    origin: { label: booking.pickupLabel, lat: booking.pickupLat, lng: booking.pickupLng },
    destination,
    departureAt: item.departureAt.getTime() > now.getTime() ? item.departureAt : null,
    passengers: booking.seatsRequested,
  };
}

/** What the driver's confirmed passengers contribute in total. */
export function confirmedContribution(item: DriveItem): number {
  return Math.round(item.seatsBooked * item.ride.contributionPerSeat * 100) / 100;
}
