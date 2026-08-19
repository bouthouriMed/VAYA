import { describe, it, expect } from 'vitest';
import {
  cancellationTierBadge,
  formatMinutesUntilDeparture,
  buildCancellationAnalyticsPayload,
} from '../cancellationHelpers';

describe('cancellationTierBadge', () => {
  it('returns a distinct label for each tier', () => {
    const free = cancellationTierBadge('free');
    const moderate = cancellationTierBadge('moderate');
    const severe = cancellationTierBadge('severe');
    expect(new Set([free.label, moderate.label, severe.label]).size).toBe(3);
  });

  it('uses the success Badge variant for the free tier and error for severe', () => {
    expect(cancellationTierBadge('free').variant).toBe('success');
    expect(cancellationTierBadge('severe').variant).toBe('error');
  });
});

describe('formatMinutesUntilDeparture', () => {
  it('formats minutes under an hour', () => {
    expect(formatMinutesUntilDeparture(15)).toBe('Départ dans 15 min');
  });

  it('formats hours', () => {
    expect(formatMinutesUntilDeparture(120)).toBe('Départ dans 2 h');
  });

  it('formats days', () => {
    expect(formatMinutesUntilDeparture(3 * 24 * 60)).toBe('Départ dans 3 j');
  });

  it('formats a departure that has already passed', () => {
    expect(formatMinutesUntilDeparture(-10)).toBe('Départ il y a 10 min');
  });
});

describe('buildCancellationAnalyticsPayload', () => {
  it('uses the tier itself as the time bucket', () => {
    expect(buildCancellationAnalyticsPayload('rider', 'severe')).toEqual({
      role: 'rider',
      timeBucket: 'severe',
    });
  });

  it('carries the caller role through unchanged', () => {
    expect(buildCancellationAnalyticsPayload('driver', 'free').role).toBe('driver');
  });
});
