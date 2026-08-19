import { describe, it, expect } from 'vitest';
import { isWithinRatingWindow, ratingWindowExpiresAt, RATING_WINDOW_MS } from '../rating-window';

describe('isWithinRatingWindow', () => {
  const completedAt = new Date('2026-01-01T00:00:00.000Z');

  it('is true immediately after completion', () => {
    expect(isWithinRatingWindow(completedAt, completedAt)).toBe(true);
  });

  it('is true at exactly the 24h boundary (inclusive)', () => {
    const boundary = new Date(completedAt.getTime() + RATING_WINDOW_MS);
    expect(isWithinRatingWindow(completedAt, boundary)).toBe(true);
  });

  it('is false one millisecond past the 24h boundary', () => {
    const pastBoundary = new Date(completedAt.getTime() + RATING_WINDOW_MS + 1);
    expect(isWithinRatingWindow(completedAt, pastBoundary)).toBe(false);
  });

  it('is true one millisecond before the 24h boundary', () => {
    const justBefore = new Date(completedAt.getTime() + RATING_WINDOW_MS - 1);
    expect(isWithinRatingWindow(completedAt, justBefore)).toBe(true);
  });

  it('is false for a "now" before the trip even completed', () => {
    const before = new Date(completedAt.getTime() - 1);
    expect(isWithinRatingWindow(completedAt, before)).toBe(false);
  });
});

describe('ratingWindowExpiresAt', () => {
  it('returns completedAt + 24h', () => {
    const completedAt = new Date('2026-01-01T00:00:00.000Z');
    expect(ratingWindowExpiresAt(completedAt).toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});
