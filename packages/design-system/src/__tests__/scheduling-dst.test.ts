import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, buildDayOptions, buildMonthGrid, buildTimeOptions, formatTime } from '../utils/scheduling';

/**
 * Tunisia has no daylight saving, but many VAYA riders and drivers live in
 * Europe. Day arithmetic used to add 24h of milliseconds, so across the
 * October clock change the calendar grid showed the 25th twice. Pin a DST
 * zone for these tests (Node applies a runtime TZ change immediately).
 */
const originalTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Europe/Paris';
});

afterAll(() => {
  process.env.TZ = originalTz;
});

describe('calendar math across a DST change (Europe/Paris, 25 Oct 2026)', () => {
  it('addDays keeps the wall-clock time and lands on consecutive days', () => {
    const start = new Date(2026, 9, 24, 9, 30);
    const next = addDays(start, 1);
    const after = addDays(start, 2);
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([25, 9, 30]);
    expect([after.getDate(), after.getHours(), after.getMinutes()]).toEqual([26, 9, 30]);
  });

  it('the October month grid lists every day exactly once', () => {
    const grid = buildMonthGrid(new Date(2026, 9, 1), new Date(2026, 9, 1));
    const octoberDays = grid.filter((c) => c.isCurrentMonth).map((c) => c.date.getDate());
    expect(octoberDays).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(grid).toHaveLength(42);
  });

  it('day chips spanning the change are consecutive calendar days', () => {
    const days = buildDayOptions(new Date(2026, 9, 23, 10), 5, 'fr-FR');
    expect(days.map((d) => d.date.getDate())).toEqual([23, 24, 25, 26, 27]);
  });

  it('time slots on the change day start and end at the requested wall-clock times', () => {
    const slots = buildTimeOptions(new Date(2026, 9, 25), new Date(2026, 9, 1));
    expect(formatTime(slots[0]!, 'fr-FR')).toBe('06:00');
    expect(formatTime(slots[slots.length - 1]!, 'fr-FR')).toBe('23:30');
  });
});

describe('formatTime is always 24-hour', () => {
  it.each(['fr-TN', 'fr-FR', 'en-GB', 'ar-TN'])('%s renders 20:26, never a 12-hour clock', (locale) => {
    const label = formatTime(new Date(2026, 9, 2, 20, 26), locale);
    expect(label).not.toMatch(/AM|PM|ص|م/);
    expect(label.replace(/[^\d:٠-٩]/g, '')).toMatch(/20:26|٢٠:٢٦/);
  });
});
