import { describe, it, expect } from 'vitest';
import { computeUnstartedRideAction, unstartedRideCloseAt } from '../ride-expiry';
import { canTransitionRideStatus } from '../ride-status';
import { DEFAULT_ASSUMED_TRIP_DURATION_SEC, TRIP_AUTO_CLOSE_GRACE_MS } from '../../trip/trip-staleness';

const HOUR = 60 * 60_000;
const departureAt = new Date(2026, 8, 17, 23, 43);
const durationSec = 4 * 3600 + 19 * 60; // ~Tunis -> Tozeur
const closeAt = departureAt.getTime() + durationSec * 1000 + TRIP_AUTO_CLOSE_GRACE_MS;

describe('unstartedRideCloseAt', () => {
  it('is expected arrival plus the trip auto-close grace', () => {
    expect(unstartedRideCloseAt(departureAt, durationSec).getTime()).toBe(closeAt);
  });

  it('falls back to the default assumed duration when the route has none', () => {
    expect(unstartedRideCloseAt(departureAt, null).getTime()).toBe(
      departureAt.getTime() + DEFAULT_ASSUMED_TRIP_DURATION_SEC * 1000 + TRIP_AUTO_CLOSE_GRACE_MS,
    );
  });
});

describe('computeUnstartedRideAction', () => {
  const base = { departureAt, estimatedDurationSec: durationSec };

  it('leaves a ride alone before its close time, even past departure', () => {
    expect(
      computeUnstartedRideAction({ ...base, tripStatuses: [], now: new Date(departureAt.getTime() + 2 * HOUR) }),
    ).toBe('none');
    expect(computeUnstartedRideAction({ ...base, tripStatuses: [], now: new Date(closeAt - 1) })).toBe('none');
  });

  it('expires a ride that never had an accepted passenger', () => {
    expect(computeUnstartedRideAction({ ...base, tripStatuses: [], now: new Date(closeAt) })).toBe('expire');
  });

  it('expires a ride whose every trip ended as a no-show or cancellation', () => {
    expect(
      computeUnstartedRideAction({ ...base, tripStatuses: ['no_show', 'cancelled'], now: new Date(closeAt + HOUR) }),
    ).toBe('expire');
  });

  it('completes a ride whose passenger trip was completed without the ride ever being started', () => {
    expect(
      computeUnstartedRideAction({ ...base, tripStatuses: ['completed', 'no_show'], now: new Date(closeAt + HOUR) }),
    ).toBe('complete');
  });

  it('never closes a ride while one of its trips still has a live lifecycle', () => {
    for (const live of ['scheduled', 'driver_approaching', 'pickup', 'active', 'arriving'] as const) {
      expect(
        computeUnstartedRideAction({ ...base, tripStatuses: ['completed', live], now: new Date(closeAt + 24 * HOUR) }),
      ).toBe('none');
    }
  });
});

describe('expired ride status', () => {
  it('is reachable only from published/full, and is terminal', () => {
    expect(canTransitionRideStatus('published', 'expired')).toBe(true);
    expect(canTransitionRideStatus('full', 'expired')).toBe(true);
    expect(canTransitionRideStatus('draft', 'expired')).toBe(false);
    expect(canTransitionRideStatus('in_progress', 'expired')).toBe(false);
    expect(canTransitionRideStatus('expired', 'published')).toBe(false);
    expect(canTransitionRideStatus('expired', 'cancelled')).toBe(false);
  });
});
