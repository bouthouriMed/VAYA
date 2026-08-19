import { describe, it, expect } from 'vitest';
import {
  formatDaysOfWeek,
  formatTimeWindow,
  buildDetectionPromptCopy,
  buildAutoDraftDepartureAt,
} from '../recurringHelpers';

describe('formatDaysOfWeek', () => {
  it('collapses a contiguous weekday run', () => {
    expect(formatDaysOfWeek(0b0011111)).toBe('Lun-Ven');
  });

  it('lists non-contiguous days individually', () => {
    expect(formatDaysOfWeek(0b0010101)).toBe('Lun, Mer, Ven');
  });

  it('special-cases every day of the week', () => {
    expect(formatDaysOfWeek(0b1111111)).toBe('Tous les jours');
  });

  it('handles a single day', () => {
    expect(formatDaysOfWeek(0b1000000)).toBe('Dim');
  });

  it('returns an empty string for a zero mask', () => {
    expect(formatDaysOfWeek(0)).toBe('');
  });
});

describe('formatTimeWindow', () => {
  it('collapses identical start/end into a single time', () => {
    expect(formatTimeWindow('08:00', '08:00')).toBe('08:00');
  });

  it('shows a range when start and end differ', () => {
    expect(formatTimeWindow('07:45', '08:15')).toBe('07:45-08:15');
  });
});

describe('buildDetectionPromptCopy', () => {
  it('never quotes a fabricated trip count and differs by role', () => {
    const rider = buildDetectionPromptCopy({ role: 'rider' });
    const driver = buildDetectionPromptCopy({ role: 'driver' });
    expect(rider.body).not.toMatch(/\d/);
    expect(driver.body).not.toMatch(/\d/);
    expect(rider.body).not.toBe(driver.body);
  });
});

describe('buildAutoDraftDepartureAt', () => {
  it('uses the pattern time today when it has not passed yet', () => {
    const inOneHour = new Date(Date.now() + 3_600_000);
    const hh = inOneHour.getHours().toString().padStart(2, '0');
    const mm = inOneHour.getMinutes().toString().padStart(2, '0');
    const result = buildAutoDraftDepartureAt({ timeWindowStart: `${hh}:${mm}` });
    expect(result.getHours()).toBe(inOneHour.getHours());
    expect(result.getMinutes()).toBe(inOneHour.getMinutes());
    expect(result.toDateString()).toBe(new Date().toDateString());
  });

  it('falls back to ~30 minutes from now when the pattern time already passed today', () => {
    const anHourAgo = new Date(Date.now() - 3_600_000);
    const hh = anHourAgo.getHours().toString().padStart(2, '0');
    const mm = anHourAgo.getMinutes().toString().padStart(2, '0');
    const result = buildAutoDraftDepartureAt({ timeWindowStart: `${hh}:${mm}` });
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });
});
