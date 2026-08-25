import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import {
  formatDaysOfWeek,
  formatTimeWindow,
  buildDetectionPromptCopy,
  buildAutoDraftDepartureAt,
} from '../recurringHelpers';

// Mock translation function for tests
const mockT: TFunction = ((key: string) => {
  const translations: Record<string, string> = {
    'booking:days.mon': 'Lun',
    'booking:days.tue': 'Mar',
    'booking:days.wed': 'Mer',
    'booking:days.thu': 'Jeu',
    'booking:days.fri': 'Ven',
    'booking:days.sat': 'Sam',
    'booking:days.sun': 'Dim',
    'booking:days.everyDay': 'Tous les jours',
    'booking:recurring.detectedTitle': 'Trajet régulier détecté',
    'booking:recurring.detectedBodyDriver': "Vous avez pris cet itinéraire plusieurs fois récemment. Souhaitez-vous le publier automatiquement ?",
    'booking:recurring.detectedBodyRider': "Vous avez recherché cet itinéraire plusieurs fois récemment. Souhaitez-vous être notifié lorsqu'un conducteur le publie ?",
  };
  return translations[key] ?? key;
}) as unknown as TFunction;

describe('formatDaysOfWeek', () => {
  it('collapses a contiguous weekday run', () => {
    expect(formatDaysOfWeek(0b0011111, mockT)).toBe('Lun-Ven');
  });

  it('lists non-contiguous days individually', () => {
    expect(formatDaysOfWeek(0b0010101, mockT)).toBe('Lun, Mer, Ven');
  });

  it('special-cases every day of the week', () => {
    expect(formatDaysOfWeek(0b1111111, mockT)).toBe('Tous les jours');
  });

  it('handles a single day', () => {
    expect(formatDaysOfWeek(0b1000000, mockT)).toBe('Dim');
  });

  it('returns an empty string for a zero mask', () => {
    expect(formatDaysOfWeek(0, mockT)).toBe('');
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
    const rider = buildDetectionPromptCopy({ role: 'rider' }, mockT);
    const driver = buildDetectionPromptCopy({ role: 'driver' }, mockT);
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
    // Whether "now + 1h" is still *today* depends on when the suite runs —
    // near midnight it lands tomorrow, so the constructed time has already
    // passed today and the helper must take its fallback branch. Derive the
    // expectation from the actual clock instead of assuming.
    const patternTimeToday = new Date();
    patternTimeToday.setHours(Number(hh), Number(mm), 0, 0);
    const result = buildAutoDraftDepartureAt({ timeWindowStart: `${hh}:${mm}` });
    if (patternTimeToday.getTime() > Date.now()) {
      expect(result.getHours()).toBe(patternTimeToday.getHours());
      expect(result.getMinutes()).toBe(patternTimeToday.getMinutes());
      expect(result.toDateString()).toBe(patternTimeToday.toDateString());
    } else {
      expect(result.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it('falls back to ~30 minutes from now when the pattern time already passed today', () => {
    const anHourAgo = new Date(Date.now() - 3_600_000);
    const hh = anHourAgo.getHours().toString().padStart(2, '0');
    const mm = anHourAgo.getMinutes().toString().padStart(2, '0');
    const result = buildAutoDraftDepartureAt({ timeWindowStart: `${hh}:${mm}` });
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });
});
