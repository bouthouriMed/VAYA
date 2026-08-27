import { describe, it, expect } from 'vitest';
import {
  deriveTrackingStatus,
  TRACKING_LIVE_AFTER_MS,
  TRACKING_STALE_AFTER_MS,
} from '../tracking-status';

const NOW = new Date('2026-08-27T12:00:00.000Z');

describe('deriveTrackingStatus', () => {
  it('is "not_started" while the trip is still scheduled', () => {
    expect(
      deriveTrackingStatus({ tripStatus: 'scheduled', locationUpdatedAt: null, now: NOW }),
    ).toBe('not_started');
  });

  it('is "completed" once the trip reaches a terminal status, regardless of location freshness', () => {
    for (const tripStatus of ['completed', 'no_show', 'cancelled'] as const) {
      expect(
        deriveTrackingStatus({ tripStatus, locationUpdatedAt: NOW, now: NOW }),
      ).toBe('completed');
    }
  });

  it('is "starting" once tracking begins but no fix has arrived yet', () => {
    expect(
      deriveTrackingStatus({ tripStatus: 'driver_approaching', locationUpdatedAt: null, now: NOW }),
    ).toBe('starting');
  });

  it('is "live" for a fresh fix', () => {
    const locationUpdatedAt = new Date(NOW.getTime() - 5_000);
    expect(deriveTrackingStatus({ tripStatus: 'active', locationUpdatedAt, now: NOW })).toBe(
      'live',
    );
  });

  it('is "live" exactly at the live-threshold boundary (inclusive)', () => {
    const locationUpdatedAt = new Date(NOW.getTime() - TRACKING_LIVE_AFTER_MS);
    expect(deriveTrackingStatus({ tripStatus: 'active', locationUpdatedAt, now: NOW })).toBe(
      'live',
    );
  });

  it('is "stale" just past the live threshold', () => {
    const locationUpdatedAt = new Date(NOW.getTime() - TRACKING_LIVE_AFTER_MS - 1);
    expect(deriveTrackingStatus({ tripStatus: 'active', locationUpdatedAt, now: NOW })).toBe(
      'stale',
    );
  });

  it('is "unavailable" once past the stale threshold', () => {
    const locationUpdatedAt = new Date(NOW.getTime() - TRACKING_STALE_AFTER_MS - 1);
    expect(deriveTrackingStatus({ tripStatus: 'arriving', locationUpdatedAt, now: NOW })).toBe(
      'unavailable',
    );
  });

  it('never shows a trip in "pickup" status without tracking as anything but a real state', () => {
    expect(
      deriveTrackingStatus({ tripStatus: 'pickup', locationUpdatedAt: null, now: NOW }),
    ).toBe('starting');
  });
});
