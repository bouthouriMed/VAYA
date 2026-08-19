import { describe, it, expect } from 'vitest';
import { canTransitionTripStatus, TRIP_STATUSES } from '../trip-status';

describe('canTransitionTripStatus', () => {
  it('allows completed directly from every non-terminal status (Phase 9 addition)', () => {
    const nonTerminal = TRIP_STATUSES.filter(
      (s) => !['completed', 'no_show', 'cancelled'].includes(s),
    );
    for (const status of nonTerminal) {
      expect(canTransitionTripStatus(status, 'completed')).toBe(true);
    }
  });

  it('allows no_show directly from every non-terminal status (Phase 10 addition)', () => {
    const nonTerminal = TRIP_STATUSES.filter(
      (s) => !['completed', 'no_show', 'cancelled'].includes(s),
    );
    for (const status of nonTerminal) {
      expect(canTransitionTripStatus(status, 'no_show')).toBe(true);
    }
  });

  it('still allows the original step-by-step progression', () => {
    expect(canTransitionTripStatus('scheduled', 'driver_approaching')).toBe(true);
    expect(canTransitionTripStatus('driver_approaching', 'pickup')).toBe(true);
    expect(canTransitionTripStatus('pickup', 'active')).toBe(true);
    expect(canTransitionTripStatus('active', 'arriving')).toBe(true);
    expect(canTransitionTripStatus('arriving', 'completed')).toBe(true);
  });

  it('rejects any transition out of a terminal status', () => {
    expect(canTransitionTripStatus('completed', 'scheduled')).toBe(false);
    expect(canTransitionTripStatus('no_show', 'completed')).toBe(false);
    expect(canTransitionTripStatus('cancelled', 'completed')).toBe(false);
  });

  it('rejects skipping backwards', () => {
    expect(canTransitionTripStatus('active', 'scheduled')).toBe(false);
  });
});
