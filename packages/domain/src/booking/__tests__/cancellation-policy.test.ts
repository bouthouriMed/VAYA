import { describe, it, expect } from 'vitest';
import {
  computeCancellationPolicy,
  canReportNoShow,
  CANCELLATION_PENALTY_POINTS,
  NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE,
} from '../cancellation-policy';

const DEPARTURE = new Date('2026-08-20T12:00:00.000Z');

function minutesBefore(minutes: number): Date {
  return new Date(DEPARTURE.getTime() - minutes * 60_000);
}

describe('computeCancellationPolicy', () => {
  it('is "free" well before departure (e.g. 3 days out)', () => {
    const result = computeCancellationPolicy(DEPARTURE, minutesBefore(3 * 24 * 60));
    expect(result.tier).toBe('free');
    expect(result.penaltyPoints).toBe(0);
  });

  it('is "free" exactly at the 24h boundary (inclusive)', () => {
    const result = computeCancellationPolicy(DEPARTURE, minutesBefore(24 * 60));
    expect(result.tier).toBe('free');
  });

  it('is "moderate" just inside the 24h boundary (23h59)', () => {
    const result = computeCancellationPolicy(DEPARTURE, minutesBefore(24 * 60 - 1));
    expect(result.tier).toBe('moderate');
    expect(result.penaltyPoints).toBe(CANCELLATION_PENALTY_POINTS.moderate);
  });

  it('is "moderate" exactly at the 30-minute boundary (inclusive)', () => {
    const result = computeCancellationPolicy(DEPARTURE, minutesBefore(30));
    expect(result.tier).toBe('moderate');
  });

  it('is "severe" just inside the 30-minute boundary (29 minutes)', () => {
    const result = computeCancellationPolicy(DEPARTURE, minutesBefore(29));
    expect(result.tier).toBe('severe');
    expect(result.penaltyPoints).toBe(CANCELLATION_PENALTY_POINTS.severe);
  });

  it('is "severe" after departure has already passed', () => {
    const result = computeCancellationPolicy(DEPARTURE, minutesBefore(-10));
    expect(result.tier).toBe('severe');
    expect(result.minutesBeforeDeparture).toBeLessThan(0);
  });

  it('severe penalty points are strictly greater than moderate, which are strictly greater than free', () => {
    expect(CANCELLATION_PENALTY_POINTS.severe).toBeGreaterThan(CANCELLATION_PENALTY_POINTS.moderate);
    expect(CANCELLATION_PENALTY_POINTS.moderate).toBeGreaterThan(CANCELLATION_PENALTY_POINTS.free);
  });

  it('returns non-empty, tier-specific consequence copy', () => {
    const free = computeCancellationPolicy(DEPARTURE, minutesBefore(3 * 24 * 60));
    const severe = computeCancellationPolicy(DEPARTURE, minutesBefore(5));
    expect(free.consequence.length).toBeGreaterThan(0);
    expect(severe.consequence.length).toBeGreaterThan(0);
    expect(free.consequence).not.toBe(severe.consequence);
  });
});

describe('canReportNoShow', () => {
  it('rejects reporting before departure', () => {
    expect(canReportNoShow(DEPARTURE, minutesBefore(5))).toBe(false);
  });

  it('rejects reporting exactly at departure time', () => {
    expect(canReportNoShow(DEPARTURE, DEPARTURE)).toBe(false);
  });

  it('rejects reporting within the grace buffer past departure', () => {
    const justPast = new Date(DEPARTURE.getTime() + (NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE - 1) * 60_000);
    expect(canReportNoShow(DEPARTURE, justPast)).toBe(false);
  });

  it('allows reporting exactly at the grace-buffer boundary (inclusive)', () => {
    const atBoundary = new Date(DEPARTURE.getTime() + NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE * 60_000);
    expect(canReportNoShow(DEPARTURE, atBoundary)).toBe(true);
  });

  it('allows reporting well past departure', () => {
    const wellPast = new Date(DEPARTURE.getTime() + 60 * 60_000);
    expect(canReportNoShow(DEPARTURE, wellPast)).toBe(true);
  });
});
