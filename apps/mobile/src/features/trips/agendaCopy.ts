import type { TFunction } from 'i18next';
import type { SupportedLocale } from '@vaya/config';
import type { AgendaTone } from '@vaya/design-system';
import { formatCurrency, formatDate, formatTime } from '../../utils/localeFormat';
import { formatDurationLabel } from '../../utils/durationLabel';
import { shortenPlaceLabel } from '../../utils/placeLabel';
import type { AgendaItem, BookingItem, DriveItem } from './agenda';

/**
 * Every string the trips tab shows about a trip, from the agenda model.
 * Each status has its own literal key (no `t(\`…${status}\`)`), so the
 * i18n key-coverage test proves all of them exist in fr, en and ar.
 */

export function placesRoute(originLabel: string, destinationLabel: string): string {
  return `${shortenPlaceLabel(originLabel)} → ${shortenPlaceLabel(destinationLabel)}`;
}

export function routeLabel(item: AgendaItem): string {
  return placesRoute(item.originLabel, item.destinationLabel);
}

export function driverFirstName(item: BookingItem, t: TFunction): string {
  const full = item.booking.ride?.driverFullName?.trim();
  if (!full) return t('common:terms.driver');
  const [first, ...rest] = full.split(/\s+/);
  const initial = rest.length > 0 ? ` ${rest[rest.length - 1]!.charAt(0)}.` : '';
  return `${first}${initial}`;
}

/** "Aujourd'hui", "Demain", "Hier", else "samedi 18 octobre". */
export function dayLabel(day: Date, offset: number, t: TFunction, locale: SupportedLocale): string {
  if (offset === 0) return t('trips:agenda.today');
  if (offset === 1) return t('trips:agenda.tomorrow');
  if (offset === -1) return t('trips:agenda.yesterday');
  return formatDate(day, locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function monthLabel(month: Date, locale: SupportedLocale): string {
  return formatDate(month, locale, { month: 'long', year: 'numeric' });
}

function calendarOffset(date: Date, now: Date): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

/** "Aujourd'hui · 18:15", "Demain · 08:00", "samedi 18 octobre · 09:00". */
export function dayAndTime(date: Date, now: Date, t: TFunction, locale: SupportedLocale): string {
  return `${dayLabel(date, calendarOffset(date, now), t, locale)} · ${formatTime(date, locale)}`;
}

/** A clock time, with the day only when it isn't today. */
export function deadlineLabel(date: Date, now: Date, t: TFunction, locale: SupportedLocale): string {
  if (calendarOffset(date, now) === 0) return formatTime(date, locale);
  return inlineDayAndTime(date, now, t, locale);
}

/** `dayAndTime` for use mid-sentence ("réponse avant demain · 08:00"). */
export function inlineDayAndTime(date: Date, now: Date, t: TFunction, locale: SupportedLocale): string {
  const label = dayAndTime(date, now, t, locale);
  return label.charAt(0).toLocaleLowerCase(locale) + label.slice(1);
}

export function seatsLabel(item: DriveItem, t: TFunction): string {
  return t('trips:agenda.seats', { booked: item.seatsBooked, total: item.ride.seatsTotal });
}

function requestsSuffix(item: DriveItem, t: TFunction): string {
  return item.pendingRequestCount > 0 ? ` · ${t('trips:agenda.requests', { count: item.pendingRequestCount })}` : '';
}

export interface RowStatus {
  text: string;
  tone: AgendaTone;
}

function driveRowStatus(item: DriveItem, t: TFunction): RowStatus {
  switch (item.status) {
    case 'draft':
      return { text: t('trips:status.driverDraft'), tone: 'default' };
    case 'awaiting_verification':
      return { text: t('trips:status.driverAwaitingVerification'), tone: 'warning' };
    case 'scheduled':
      return {
        text:
          (item.ride.status === 'full'
            ? t('trips:status.driverFull', { seats: seatsLabel(item, t) })
            : t('trips:status.driverPublished', { seats: seatsLabel(item, t) })) + requestsSuffix(item, t),
        tone: item.pendingRequestCount > 0 ? 'warning' : 'success',
      };
    case 'departure_passed':
      return item.acceptedBookingCount > 0
        ? { text: t('trips:status.driverToStart'), tone: 'warning' }
        : { text: t('trips:status.driverDeparturePassed'), tone: 'default' };
    case 'driving':
      return { text: t('trips:status.driverDriving'), tone: 'info' };
    case 'completed':
      return item.seatsBooked > 0
        ? { text: t('trips:status.driverCompleted', { count: item.seatsBooked }), tone: 'default' }
        : { text: t('trips:status.driverCompletedEmpty'), tone: 'default' };
    case 'cancelled':
      return { text: t('trips:status.driverCancelled'), tone: 'error' };
    case 'not_published':
      return { text: t('trips:status.driverNotPublished'), tone: 'default' };
    case 'expired':
    default:
      return { text: t('trips:status.driverExpired'), tone: 'default' };
  }
}

function bookingRowStatus(item: BookingItem, now: Date, t: TFunction, locale: SupportedLocale): RowStatus {
  const driver = driverFirstName(item, t);
  switch (item.status) {
    case 'awaiting_response':
      return item.requestExpiresAt
        ? {
            text: t('trips:status.awaitingResponse', { time: deadlineLabel(item.requestExpiresAt, now, t, locale) }),
            tone: 'warning',
          }
        : { text: t('trips:status.awaitingResponseNoDeadline'), tone: 'warning' };
    case 'confirmed':
      return { text: t('trips:status.confirmed', { driver }), tone: 'success' };
    case 'departure_passed':
      return { text: t('trips:status.departurePassed', { driver }), tone: 'warning' };
    case 'trip_started':
      return { text: t('trips:status.tripStarted'), tone: 'info' };
    case 'driver_on_the_way':
      return { text: t('trips:status.driverOnTheWay'), tone: 'info' };
    case 'driver_at_pickup':
      return { text: t('trips:status.driverAtPickup'), tone: 'info' };
    case 'on_board':
      return { text: t('trips:status.onBoard'), tone: 'info' };
    case 'arriving':
      return { text: t('trips:status.arriving'), tone: 'info' };
    case 'completed':
      return { text: t('trips:status.completed', { driver }), tone: 'default' };
    case 'declined':
      return { text: t('trips:status.declined'), tone: 'error' };
    case 'cancelled_by_you':
      return { text: t('trips:status.cancelledByYou'), tone: 'default' };
    case 'cancelled_by_driver':
      return { text: t('trips:status.cancelledByDriver'), tone: 'error' };
    case 'superseded':
      return { text: t('trips:status.superseded'), tone: 'default' };
    case 'no_show':
      return { text: t('trips:status.noShow'), tone: 'error' };
    case 'expired':
    default:
      // A request nobody answered, or a confirmed seat on a trip that
      // never started — different stories, different words.
      return item.booking.status === 'pending' || item.booking.status === 'expired'
        ? { text: t('trips:status.requestExpired'), tone: 'default' }
        : { text: t('trips:status.notTaken'), tone: 'default' };
  }
}

export function rowStatus(item: AgendaItem, now: Date, t: TFunction, locale: SupportedLocale): RowStatus {
  return item.role === 'driver' ? driveRowStatus(item, t) : bookingRowStatus(item, now, t, locale);
}

/** Right column: the passenger's total, or the driver's price per seat. */
export function rowPrice(item: AgendaItem, t: TFunction, locale: SupportedLocale): { value: string; detail?: string } {
  if (item.role === 'passenger') return { value: formatCurrency(item.booking.contributionTotal, locale) };
  return { value: formatCurrency(item.ride.contributionPerSeat, locale), detail: t('trips:agenda.perSeat') };
}

export function roleLabel(item: AgendaItem, t: TFunction): string {
  return item.role === 'driver' ? t('trips:agenda.roleDriver') : t('trips:agenda.rolePassenger');
}

/** "Départ dans 1 h 20" — or "Départ imminent" in the last minute. */
export function departsIn(departureAt: Date, now: Date, t: TFunction): string {
  const minutes = Math.round((departureAt.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return t('trips:spotlight.departsNow');
  return t('trips:spotlight.departsIn', { duration: formatDurationLabel(t, minutes) });
}

export function walkLabel(meters: number | null | undefined, t: TFunction): string | null {
  if (meters == null || !Number.isFinite(meters) || meters < 50) return null;
  // ~80 m a minute, an unhurried walking pace.
  return t('trips:spotlight.walk', { duration: formatDurationLabel(t, Math.max(1, Math.round(meters / 80))) });
}
