import { describe, it, expect } from 'vitest';
import {
  computeStaleTripAction,
  TRIP_COMPLETION_REMINDER_GRACE_MS,
  TRIP_AUTO_CLOSE_GRACE_MS,
  TRIP_AUTO_CLOSE_STALE_LOCATION_MS,
  DEFAULT_ASSUMED_TRIP_DURATION_SEC,
} from '../trip-staleness';

const NOW = new Date(2026, 7, 20, 12, 0);
const startedAt = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 60 * 60_000);

describe('computeStaleTripAction', () => {
  it('does nothing for a trip still within its expected duration', () => {
    expect(
      computeStaleTripAction({
        startedAt: startedAt(0.5),
        locationUpdatedAt: NOW,
        estimatedDurationSec: 3600,
        reminderAlreadySent: false,
        now: NOW,
      }),
    ).toBe('none');
  });

  it('does nothing just past the estimated duration, before the reminder grace period elapses', () => {
    expect(
      computeStaleTripAction({
        startedAt: startedAt(1.1), // 6 min past a 1h estimate
        locationUpdatedAt: NOW,
        estimatedDurationSec: 3600,
        reminderAlreadySent: false,
        now: NOW,
      }),
    ).toBe('none');
  });

  it('recommends a reminder once overdue by the reminder grace period, GPS still live', () => {
    const overdueMs = TRIP_COMPLETION_REMINDER_GRACE_MS + 5 * 60_000;
    expect(
      computeStaleTripAction({
        startedAt: new Date(NOW.getTime() - 3600_000 - overdueMs),
        locationUpdatedAt: NOW,
        estimatedDurationSec: 3600,
        reminderAlreadySent: false,
        now: NOW,
      }),
    ).toBe('remind');
  });

  it('never re-recommends a reminder that was already sent', () => {
    const overdueMs = TRIP_COMPLETION_REMINDER_GRACE_MS + 5 * 60_000;
    expect(
      computeStaleTripAction({
        startedAt: new Date(NOW.getTime() - 3600_000 - overdueMs),
        locationUpdatedAt: NOW,
        estimatedDurationSec: 3600,
        reminderAlreadySent: true,
        now: NOW,
      }),
    ).toBe('none');
  });

  it('never auto-completes while GPS is still actively reporting, no matter how overdue', () => {
    const overdueMs = TRIP_AUTO_CLOSE_GRACE_MS + 60 * 60_000;
    expect(
      computeStaleTripAction({
        startedAt: new Date(NOW.getTime() - 3600_000 - overdueMs),
        locationUpdatedAt: NOW, // fresh fix right now
        estimatedDurationSec: 3600,
        reminderAlreadySent: true,
        now: NOW,
      }),
    ).toBe('none');
  });

  it('auto-completes once overdue by the auto-close grace period AND GPS has gone stale', () => {
    const overdueMs = TRIP_AUTO_CLOSE_GRACE_MS + 60 * 60_000;
    expect(
      computeStaleTripAction({
        startedAt: new Date(NOW.getTime() - 3600_000 - overdueMs),
        locationUpdatedAt: new Date(NOW.getTime() - TRIP_AUTO_CLOSE_STALE_LOCATION_MS - 60_000),
        estimatedDurationSec: 3600,
        reminderAlreadySent: true,
        now: NOW,
      }),
    ).toBe('auto_complete');
  });

  it('auto-completes a trip with no location fix at all, once genuinely overdue enough', () => {
    const overdueMs = TRIP_AUTO_CLOSE_GRACE_MS + 60 * 60_000;
    expect(
      computeStaleTripAction({
        startedAt: new Date(NOW.getTime() - 3600_000 - overdueMs),
        locationUpdatedAt: null,
        estimatedDurationSec: 3600,
        reminderAlreadySent: true,
        now: NOW,
      }),
    ).toBe('auto_complete');
  });

  it('falls back to a conservative default duration when the ride has no real estimate (haversine fallback)', () => {
    // Only 1h in — well under the default 2h assumed duration, so nothing yet.
    expect(
      computeStaleTripAction({
        startedAt: startedAt(1),
        locationUpdatedAt: NOW,
        estimatedDurationSec: null,
        reminderAlreadySent: false,
        now: NOW,
      }),
    ).toBe('none');

    const overdueHours = (DEFAULT_ASSUMED_TRIP_DURATION_SEC + TRIP_COMPLETION_REMINDER_GRACE_MS / 1000 + 300) / 3600;
    expect(
      computeStaleTripAction({
        startedAt: startedAt(overdueHours),
        locationUpdatedAt: NOW,
        estimatedDurationSec: null,
        reminderAlreadySent: false,
        now: NOW,
      }),
    ).toBe('remind');
  });
});
