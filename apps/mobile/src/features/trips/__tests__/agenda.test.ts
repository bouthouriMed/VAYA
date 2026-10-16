import { describe, it, expect } from 'vitest';
import {
  buildAgendaItems,
  bookingStatus,
  driveStatus,
  selectSpotlight,
  buildTodos,
  groupUpcomingByDay,
  groupHistoryByMonth,
  hasBothRoles,
  pollingIntervalFor,
  type AgendaItem,
} from '../agenda';
import type { Booking, MyRide, PendingRating } from '../../../state/api';

// Thursday 2026-10-15, 16:00 local.
const NOW = new Date(2026, 9, 15, 16, 0);
const at = (day: number, hours: number, minutes = 0): string => new Date(2026, 9, day, hours, minutes).toISOString();
const minutesFromNow = (minutes: number): string => new Date(NOW.getTime() + minutes * 60_000).toISOString();

function ride(overrides: Partial<MyRide> = {}): MyRide {
  return {
    id: 'r1',
    driverProfileId: 'dp1',
    vehicleId: 'v1',
    routeId: null,
    originLabel: 'Tunis',
    originLat: 36.8,
    originLng: 10.18,
    destinationLabel: 'Sousse',
    destinationLat: 35.83,
    destinationLng: 10.6,
    departureAt: at(16, 8),
    seatsTotal: 3,
    seatsAvailable: 2,
    contributionPerSeat: 18.5,
    status: 'published',
    routePolyline: null,
    estimatedDurationSec: 7500,
    routeKind: null,
    publishOnVerificationAt: null,
    pendingRequestCount: 0,
    nextRequestExpiresAt: null,
    acceptedBookingCount: 1,
    ...overrides,
  };
}

function booking(overrides: Partial<Booking> = {}, rideOverrides: Partial<NonNullable<Booking['ride']>> = {}): Booking {
  return {
    id: 'b1',
    rideId: 'r9',
    riderId: 'me',
    seatsRequested: 1,
    contributionTotal: 4.5,
    status: 'accepted',
    pickupStopId: null,
    pickupLabel: 'Lac 2',
    pickupLat: 36.84,
    pickupLng: 10.27,
    pickupWalkMeters: 300,
    dropoffStopId: null,
    dropoffLabel: 'La Marsa',
    dropoffLat: 36.88,
    dropoffLng: 10.33,
    dropoffWalkMeters: null,
    requestedAt: at(14, 9),
    respondedAt: at(14, 10),
    expiresAt: null,
    tripId: 't1',
    tripStatus: 'scheduled',
    ride: {
      originLabel: 'Tunis',
      destinationLabel: 'Bizerte',
      departureAt: at(15, 18, 15),
      contributionPerSeat: 4.5,
      driverFullName: 'Sarra Khelifi',
      driverUserId: 'u-sarra',
      driverAvatarUrl: null,
      estimatedDurationSec: 1500,
      status: 'published',
      ...rideOverrides,
    },
    ...overrides,
  };
}

const rating = (completedAt: string): PendingRating => ({
  tripId: 'trip-done',
  role: 'rider_rates_driver',
  counterpartName: 'Karim',
  completedAt,
  bookingId: 'b-done',
  originLabel: 'Sfax',
  destinationLabel: 'Tunis',
});

describe('driveStatus', () => {
  it('maps every ride status, using the clock only to tell scheduled from missed', () => {
    expect(driveStatus(ride({ status: 'published' }), NOW)).toBe('scheduled');
    expect(driveStatus(ride({ status: 'full' }), NOW)).toBe('scheduled');
    expect(driveStatus(ride({ status: 'in_progress', departureAt: at(15, 15) }), NOW)).toBe('driving');
    expect(driveStatus(ride({ status: 'completed' }), NOW)).toBe('completed');
    expect(driveStatus(ride({ status: 'cancelled' }), NOW)).toBe('cancelled');
    expect(driveStatus(ride({ status: 'expired' }), NOW)).toBe('expired');
  });

  it('never calls a ride "en cours" from the clock alone', () => {
    expect(driveStatus(ride({ status: 'published', departureAt: at(15, 15) }), NOW)).toBe('departure_passed');
    expect(driveStatus(ride({ status: 'full', departureAt: at(15, 15) }), NOW)).toBe('departure_passed');
  });

  it('moves a long-missed departure out of the agenda before the server sweep does', () => {
    expect(driveStatus(ride({ status: 'published', departureAt: at(15, 8) }), NOW)).toBe('expired');
  });

  it('tells a plain draft from one waiting for verification, and drops both once departure passed', () => {
    expect(driveStatus(ride({ status: 'draft' }), NOW)).toBe('draft');
    expect(driveStatus(ride({ status: 'draft', publishOnVerificationAt: at(14, 9) }), NOW)).toBe('awaiting_verification');
    expect(driveStatus(ride({ status: 'draft', departureAt: at(15, 9) }), NOW)).toBe('not_published');
  });
});

describe('bookingStatus', () => {
  it('follows the live trip once the driver has started', () => {
    const live = { departureAt: at(15, 15, 50), status: 'in_progress' as const };
    expect(bookingStatus(booking({ tripStatus: 'driver_approaching' }, live), NOW)).toBe('driver_on_the_way');
    expect(bookingStatus(booking({ tripStatus: 'pickup' }, live), NOW)).toBe('driver_at_pickup');
    expect(bookingStatus(booking({ tripStatus: 'active' }, live), NOW)).toBe('on_board');
    expect(bookingStatus(booking({ tripStatus: 'arriving' }, live), NOW)).toBe('arriving');
    // An older API without tripStatus: the ride says it started, nothing more.
    expect(bookingStatus(booking({ tripStatus: undefined }, live), NOW)).toBe('trip_started');
  });

  it('confirmed before departure, then waiting for the driver, then out of the agenda', () => {
    expect(bookingStatus(booking(), NOW)).toBe('confirmed');
    expect(bookingStatus(booking({}, { departureAt: at(15, 15, 30) }), NOW)).toBe('departure_passed');
    expect(bookingStatus(booking({}, { departureAt: at(15, 8) }), NOW)).toBe('expired');
  });

  it('a pending request waits for the driver until its deadline', () => {
    expect(bookingStatus(booking({ status: 'pending', tripStatus: null, expiresAt: minutesFromNow(30) }), NOW)).toBe(
      'awaiting_response',
    );
    expect(bookingStatus(booking({ status: 'pending', tripStatus: null, expiresAt: minutesFromNow(-1) }), NOW)).toBe('expired');
    expect(
      bookingStatus(booking({ status: 'pending', tripStatus: null, expiresAt: null }, { departureAt: at(15, 15) }), NOW),
    ).toBe('expired');
  });

  it('maps every finished booking state', () => {
    expect(bookingStatus(booking({ status: 'completed' }), NOW)).toBe('completed');
    expect(bookingStatus(booking({ tripStatus: 'completed' }), NOW)).toBe('completed');
    expect(bookingStatus(booking({ status: 'declined', tripStatus: null }), NOW)).toBe('declined');
    expect(bookingStatus(booking({ status: 'cancelled_by_rider', tripStatus: null }), NOW)).toBe('cancelled_by_you');
    expect(bookingStatus(booking({ status: 'cancelled_by_driver', tripStatus: null }), NOW)).toBe('cancelled_by_driver');
    expect(bookingStatus(booking({}, { status: 'cancelled' }), NOW)).toBe('cancelled_by_driver');
    expect(bookingStatus(booking({ status: 'expired', tripStatus: null }), NOW)).toBe('expired');
    expect(bookingStatus(booking({ status: 'superseded', tripStatus: null }), NOW)).toBe('superseded');
    expect(bookingStatus(booking({ status: 'no_show' }), NOW)).toBe('no_show');
    expect(bookingStatus(booking({ tripStatus: 'no_show' }), NOW)).toBe('no_show');
  });
});

describe('buildAgendaItems', () => {
  it("uses the passenger's own leg and the real routed arrival", () => {
    const [item] = buildAgendaItems([], [booking()], NOW);
    expect(item).toMatchObject({ role: 'passenger', originLabel: 'Lac 2', destinationLabel: 'La Marsa' });
    expect(item!.arrivalAt).toEqual(new Date(2026, 9, 15, 18, 40));
  });

  it('never invents an arrival time', () => {
    const [item] = buildAgendaItems([ride({ estimatedDurationSec: null })], [], NOW);
    expect(item!.arrivalAt).toBeNull();
  });

  it('only counts requests the driver can still answer', () => {
    const items = buildAgendaItems(
      [ride({ id: 'a', pendingRequestCount: 2 }), ride({ id: 'b', status: 'cancelled', pendingRequestCount: 2 })],
      [],
      NOW,
    );
    expect(items.map((item) => (item.role === 'driver' ? item.pendingRequestCount : null))).toEqual([2, 0]);
  });

  it('skips a booking with no ride attached instead of guessing', () => {
    expect(buildAgendaItems([], [booking({ ride: undefined })], NOW)).toEqual([]);
  });
});

describe('selectSpotlight', () => {
  const pick = (rides: MyRide[], bookings: Booking[], pending: PendingRating | null = null) =>
    selectSpotlight(buildAgendaItems(rides, bookings, NOW), pending, NOW);

  it('a live trip beats everything, in either role', () => {
    const spot = pick(
      [ride({ id: 'soon', departureAt: minutesFromNow(30) })],
      [booking({ tripStatus: 'active' }, { status: 'in_progress', departureAt: at(15, 15, 40) })],
      rating(minutesFromNow(-10)),
    );
    expect(spot).toMatchObject({ kind: 'trip', moment: 'live', item: { key: 'booking:b1' } });

    const driving = pick([ride({ status: 'in_progress', departureAt: at(15, 15, 40) })], [booking()]);
    expect(driving).toMatchObject({ kind: 'trip', moment: 'live', item: { key: 'drive:r1' } });
  });

  it('asks the driver to start a ride whose passengers are waiting', () => {
    const spot = pick([ride({ departureAt: at(15, 15, 45), acceptedBookingCount: 2 })], [booking()]);
    expect(spot).toMatchObject({ moment: 'needs_start', item: { key: 'drive:r1' } });
  });

  it('does not spotlight a missed departure nobody booked', () => {
    const spot = pick([ride({ departureAt: at(15, 15, 45), acceptedBookingCount: 0 })], []);
    expect(spot).toBeNull();
  });

  it("tells a passenger the driver hasn't started yet", () => {
    const spot = pick([], [booking({}, { departureAt: at(15, 15, 50) })]);
    expect(spot).toMatchObject({ moment: 'waiting_driver' });
  });

  it('a trip within three hours beats a pending rating; a later one does not', () => {
    const recent = rating(minutesFromNow(-30));
    expect(pick([], [booking()], recent)).toMatchObject({ kind: 'trip', moment: 'soon' });
    expect(pick([ride()], [], recent)).toMatchObject({ kind: 'rating' });
  });

  it('an old unrated trip never takes the top card', () => {
    expect(pick([ride()], [], rating(minutesFromNow(-5 * 60)))).toMatchObject({ kind: 'trip', moment: 'next' });
  });

  it('picks the soonest trip across roles, and ignores drafts and finished trips', () => {
    const spot = pick(
      [ride({ id: 'draft', status: 'draft', departureAt: minutesFromNow(20) }), ride({ id: 'later' })],
      [booking({ id: 'gone', status: 'declined', tripStatus: null }, { departureAt: minutesFromNow(10) }), booking()],
    );
    expect(spot).toMatchObject({ moment: 'soon', item: { key: 'booking:b1' } });
  });

  it('a request waiting on the driver can be on top', () => {
    const spot = pick(
      [],
      [booking({ status: 'pending', tripStatus: null, expiresAt: minutesFromNow(60) }, { departureAt: at(18, 9) })],
    );
    expect(spot).toMatchObject({ moment: 'next', item: { status: 'awaiting_response' } });
  });

  it('is empty when nothing is coming up', () => {
    expect(pick([ride({ status: 'completed' })], [])).toBeNull();
  });
});

describe('buildTodos', () => {
  it('lists requests by deadline, missed starts and the unrated trip, never repeating the top card', () => {
    const items = buildAgendaItems(
      [
        ride({ id: 'top', departureAt: minutesFromNow(60), pendingRequestCount: 1, nextRequestExpiresAt: minutesFromNow(20) }),
        ride({ id: 'b', departureAt: at(18, 9), pendingRequestCount: 1, nextRequestExpiresAt: minutesFromNow(300) }),
        ride({ id: 'a', departureAt: at(19, 9), pendingRequestCount: 2, nextRequestExpiresAt: minutesFromNow(90) }),
      ],
      [],
      NOW,
    );
    const pending = rating(at(14, 12));
    const spotlight = selectSpotlight(items, pending, NOW);
    expect(spotlight).toMatchObject({ item: { key: 'drive:top' } });
    const todos = buildTodos(items, pending, spotlight);
    expect(todos.map((todo) => todo.key)).toEqual(['requests:a', 'requests:b', 'rate:trip-done']);
    expect(todos[0]).toMatchObject({ count: 2 });
  });

  it('a second missed start becomes a to-do', () => {
    const items = buildAgendaItems(
      [
        ride({ id: 'x', departureAt: at(15, 15, 30), acceptedBookingCount: 1 }),
        ride({ id: 'y', departureAt: at(15, 15, 45), acceptedBookingCount: 1 }),
      ],
      [],
      NOW,
    );
    const spotlight = selectSpotlight(items, null, NOW);
    expect(buildTodos(items, null, spotlight).map((todo) => todo.key)).toEqual(['start:y']);
  });

  it("doesn't repeat a rating that is already on top", () => {
    const pending = rating(minutesFromNow(-15));
    const items = buildAgendaItems([], [], NOW);
    expect(buildTodos(items, pending, selectSpotlight(items, pending, NOW))).toEqual([]);
  });
});

describe('grouping', () => {
  const items: AgendaItem[] = buildAgendaItems(
    [ride({ id: 'tomorrow' }), ride({ id: 'sunday', departureAt: at(18, 17, 30) }), ride({ id: 'old', status: 'completed', departureAt: at(2, 7) })],
    [
      booking(),
      booking({ id: 'sept', status: 'cancelled_by_rider', tripStatus: null }, { departureAt: new Date(2026, 8, 28, 9).toISOString() }),
    ],
    NOW,
  );

  it('groups the agenda by calendar day, without the top card', () => {
    const spotlight = selectSpotlight(items, null, NOW);
    const sections = groupUpcomingByDay(items, spotlight, NOW);
    expect(sections.map((s) => [s.offset, s.items.map((i) => i.key)])).toEqual([
      [1, ['drive:tomorrow']],
      [3, ['drive:sunday']],
    ]);
  });

  it('groups history by month, newest first', () => {
    const sections = groupHistoryByMonth(items);
    expect(sections.map((s) => [s.key, s.items.map((i) => i.key)])).toEqual([
      ['2026-10', ['drive:old']],
      ['2026-09', ['booking:sept']],
    ]);
  });

  it('counts days across a daylight-saving change correctly', () => {
    // Europe moves clocks back on 2026-10-25; Tunisia doesn't, but devices may.
    const late = buildAgendaItems([ride({ departureAt: at(26, 9) })], [], NOW);
    expect(groupUpcomingByDay(late, null, NOW)[0]!.offset).toBe(11);
  });

  it('shows role chips only to people who do both', () => {
    expect(hasBothRoles(items)).toBe(true);
    expect(hasBothRoles(buildAgendaItems([], [booking()], NOW))).toBe(false);
  });
});

describe('pollingIntervalFor', () => {
  it('refreshes faster while something is happening', () => {
    const items = buildAgendaItems([], [booking({ tripStatus: 'active' }, { status: 'in_progress' })], NOW);
    expect(pollingIntervalFor(selectSpotlight(items, null, NOW))).toBe(15_000);
    expect(pollingIntervalFor(null)).toBe(60_000);
  });
});
