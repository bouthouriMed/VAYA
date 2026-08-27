import { describe, it, expect } from 'vitest';
import { toEventInput } from '../eventMapping';

describe('toEventInput', () => {
  it('maps a bare event name with no payload', () => {
    expect(toEventInput('search_started', {})).toEqual({ eventName: 'search_started' });
  });

  it('lifts recognized named fields onto the event, not into metadata', () => {
    const result = toEventInput('search_submitted', {
      searchId: 'abc-123',
      originLat: 36.8,
      originLng: 10.18,
      seats: 2,
      resultCount: 5,
      matchTier: 'exact',
    });
    expect(result).toEqual({
      eventName: 'search_submitted',
      searchId: 'abc-123',
      originLat: 36.8,
      originLng: 10.18,
      seats: 2,
      resultCount: 5,
      matchTier: 'exact',
    });
    expect(result.metadata).toBeUndefined();
  });

  it('routes anything not in the named-field set into metadata', () => {
    const result = toEventInput('driver_request_response', { action: 'accept', source: 'ride-hub' });
    expect(result).toEqual({
      eventName: 'driver_request_response',
      metadata: { action: 'accept', source: 'ride-hub' },
    });
  });

  it('drops undefined values entirely rather than forwarding them', () => {
    const result = toEventInput('search_result_selected', { selectedRideId: undefined, extra: undefined });
    expect(result).toEqual({ eventName: 'search_result_selected' });
  });

  it('splits a mixed payload between named fields and metadata', () => {
    const result = toEventInput('search_results_shown', {
      resultCount: 3,
      matchTier: 'wide_corridor',
      customFlag: true,
    });
    expect(result).toEqual({
      eventName: 'search_results_shown',
      resultCount: 3,
      matchTier: 'wide_corridor',
      metadata: { customFlag: true },
    });
  });

  it('truncates an event name longer than the server\'s 64-char limit', () => {
    const longName = 'a'.repeat(100);
    expect(toEventInput(longName, {}).eventName).toHaveLength(64);
  });
});
