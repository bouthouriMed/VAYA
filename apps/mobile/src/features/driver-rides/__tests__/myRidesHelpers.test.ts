import { describe, it, expect } from 'vitest';
import {
  isUpcomingRide,
  pickNextUpcomingRide,
  orderRemainingRides,
  estimateArrivalLabel,
} from '../myRidesHelpers';
import type { Ride } from '../../../state/api';

// Fixed reference point: 2026-08-20, 10:00 local.
const NOW = new Date(2026, 7, 20, 10, 0);

function makeRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 'ride-1',
    driverProfileId: 'dp-1',
    vehicleId: 'v-1',
    routeId: null,
    originLabel: 'Tunis',
    originLat: 36.8,
    originLng: 10.18,
    destinationLabel: 'Nabeul',
    destinationLat: 36.45,
    destinationLng: 10.73,
    departureAt: new Date(2026, 7, 21, 14, 30).toISOString(),
    seatsTotal: 4,
    seatsAvailable: 3,
    contributionPerSeat: 25,
    status: 'published',
    routePolyline: null,
    estimatedDurationSec: 4500,
    routeKind: null,
    ...overrides,
  };
}

describe('isUpcomingRide', () => {
  it('accepts draft/published/full rides still in the future', () => {
    for (const status of ['draft', 'published', 'full'] as const) {
      expect(isUpcomingRide(makeRide({ status }), NOW)).toBe(true);
    }
  });

  it('rejects terminal-status rides even in the future', () => {
    for (const status of ['completed', 'cancelled', 'in_progress'] as const) {
      expect(isUpcomingRide(makeRide({ status }), NOW)).toBe(false);
    }
  });

  it('rejects a future-dated ride whose departure has just passed', () => {
    expect(
      isUpcomingRide(makeRide({ departureAt: new Date(2026, 7, 20, 9, 59).toISOString() }), NOW),
    ).toBe(false);
  });
});

describe('pickNextUpcomingRide', () => {
  it('returns the soonest upcoming ride', () => {
    const sooner = makeRide({ id: 'sooner', departureAt: new Date(2026, 7, 20, 18, 0).toISOString() });
    const later = makeRide({ id: 'later' });
    expect(pickNextUpcomingRide([later, sooner], NOW)?.id).toBe('sooner');
  });

  it('skips past and terminal rides entirely', () => {
    const past = makeRide({ id: 'past', departureAt: new Date(2026, 7, 19, 8, 0).toISOString() });
    const cancelled = makeRide({ id: 'cancelled', status: 'cancelled' });
    expect(pickNextUpcomingRide([past, cancelled], NOW)).toBeNull();
  });
});

describe('orderRemainingRides', () => {
  it('excludes the hero ride, lists remaining upcoming soonest-first then past newest-first', () => {
    const hero = makeRide({ id: 'hero', departureAt: new Date(2026, 7, 20, 14, 0).toISOString() });
    const nextWeek = makeRide({ id: 'next-week' });
    const tomorrow = makeRide({ id: 'tomorrow', departureAt: new Date(2026, 7, 21, 9, 0).toISOString() });
    const lastMonth = makeRide({
      id: 'last-month',
      departureAt: new Date(2026, 6, 5, 8, 0).toISOString(),
      status: 'completed',
    });
    const yesterday = makeRide({
      id: 'yesterday',
      departureAt: new Date(2026, 7, 19, 8, 0).toISOString(),
      status: 'completed',
    });

    const ordered = orderRemainingRides([hero, lastMonth, nextWeek, yesterday, tomorrow], hero.id, NOW);
    expect(ordered.map((r) => r.id)).toEqual(['tomorrow', 'next-week', 'yesterday', 'last-month']);
  });
});

describe('estimateArrivalLabel', () => {
  it('formats the OSRM-derived arrival time', () => {
    // 14:30 + 1h15m = 15:45
    expect(estimateArrivalLabel(new Date(2026, 7, 21, 14, 30).toISOString(), 4500)).toBe('15:45');
  });

  it('returns null when the ride has no real duration (haversine fallback)', () => {
    expect(estimateArrivalLabel(new Date(2026, 7, 21, 14, 30).toISOString(), null)).toBeNull();
  });
});
