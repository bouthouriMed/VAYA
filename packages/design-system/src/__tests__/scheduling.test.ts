import { describe, it, expect } from 'vitest';
import {
  buildDayOptions,
  buildMonthGrid,
  buildTimeOptions,
  firstDayWithSlots,
  formatDepartureLabel,
  formatMonthLabel,
  formatMonthName,
  formatYearLabel,
  formatTime,
  isSameDay,
  roundUpToSlot,
  startOfDay,
} from '../utils/scheduling';

describe('startOfDay / isSameDay', () => {
  it('zeroes the time components', () => {
    const d = new Date(2026, 7, 19, 14, 37, 22);
    const s = startOfDay(d);
    expect([s.getHours(), s.getMinutes(), s.getSeconds()]).toEqual([0, 0, 0]);
    expect(s.getDate()).toBe(19);
  });

  it('treats two timestamps on the same calendar day as the same day', () => {
    expect(isSameDay(new Date(2026, 7, 19, 0, 1), new Date(2026, 7, 19, 23, 59))).toBe(true);
  });

  it('treats midnight-crossing timestamps as different days', () => {
    expect(isSameDay(new Date(2026, 7, 19, 23, 59), new Date(2026, 7, 20, 0, 0))).toBe(false);
  });
});

describe('roundUpToSlot', () => {
  it('rounds up to the next grid boundary', () => {
    const rounded = roundUpToSlot(new Date(2026, 7, 19, 14, 7), 30);
    expect([rounded.getHours(), rounded.getMinutes()]).toEqual([14, 30]);
  });

  it('leaves an already-aligned time untouched', () => {
    const rounded = roundUpToSlot(new Date(2026, 7, 19, 14, 30, 0, 0), 30);
    expect([rounded.getHours(), rounded.getMinutes()]).toEqual([14, 30]);
  });

  it('rolls over into the next hour/day at a boundary', () => {
    const rounded = roundUpToSlot(new Date(2026, 7, 19, 23, 45), 30);
    expect(rounded.getDate()).toBe(20);
    expect([rounded.getHours(), rounded.getMinutes()]).toEqual([0, 0]);
  });
});

describe('buildDayOptions', () => {
  const now = new Date(2026, 7, 19, 10, 0);

  it("labels the first two days Aujourd'hui/Demain and the rest by weekday", () => {
    const days = buildDayOptions(now, 5);
    expect(days).toHaveLength(5);
    expect(days[0]!.label).toBe("Aujourd'hui");
    expect(days[1]!.label).toBe('Demain');
    expect(days[2]!.label).not.toMatch(/Aujourd|Demain/);
  });

  it('each day is local midnight, one calendar day apart', () => {
    const days = buildDayOptions(now, 3);
    expect(isSameDay(days[0]!.date, now)).toBe(true);
    expect(days[0]!.date.getHours()).toBe(0);
    expect(days[1]!.date.getTime() - days[0]!.date.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe('buildTimeOptions', () => {
  it('starts from a rounded-up "now" when the day is today', () => {
    const now = new Date(2026, 7, 19, 14, 7);
    const slots = buildTimeOptions(now, now, 30);
    expect(slots[0]!.getHours()).toBe(14);
    expect(slots[0]!.getMinutes()).toBe(30);
  });

  it('never includes a slot before now on the current day', () => {
    const now = new Date(2026, 7, 19, 14, 7);
    const slots = buildTimeOptions(now, now, 30);
    expect(slots.every((s) => s.getTime() >= now.getTime())).toBe(true);
  });

  it('starts from the configured day-start hour on a future day', () => {
    const now = new Date(2026, 7, 19, 14, 7);
    const tomorrow = new Date(2026, 7, 20);
    const slots = buildTimeOptions(tomorrow, now, 30, 6, 23.5);
    expect(slots[0]!.getHours()).toBe(6);
    expect(slots[0]!.getMinutes()).toBe(0);
  });

  it('returns an empty array once the day has no remaining slots', () => {
    const lateNight = new Date(2026, 7, 19, 23, 45);
    const slots = buildTimeOptions(lateNight, lateNight, 30, 6, 23.5);
    expect(slots).toEqual([]);
  });

  it('every slot falls within [dayStartHour, dayEndHour] on a future day', () => {
    const now = new Date(2026, 7, 19, 14, 7);
    const tomorrow = new Date(2026, 7, 20);
    const slots = buildTimeOptions(tomorrow, now, 30, 6, 23.5);
    for (const slot of slots) {
      expect(slot.getHours()).toBeGreaterThanOrEqual(6);
      expect(isSameDay(slot, tomorrow)).toBe(true);
    }
  });
});

describe('buildMonthGrid', () => {
  it('always returns exactly 42 cells (6 full weeks)', () => {
    const grid = buildMonthGrid(new Date(2026, 7, 19));
    expect(grid).toHaveLength(42);
  });

  it('starts the grid on a Monday', () => {
    const grid = buildMonthGrid(new Date(2026, 7, 19));
    expect(grid[0]!.date.getDay()).toBe(1);
  });

  it('marks leading/trailing adjacent-month days as not-current-month', () => {
    // August 2026 starts on a Saturday — the grid must include some July
    // days to fill the first week (Monday-first).
    const grid = buildMonthGrid(new Date(2026, 7, 1));
    expect(grid[0]!.isCurrentMonth).toBe(false);
    expect(grid[0]!.date.getMonth()).toBe(6);
  });

  it('flags exactly one cell as today, and only when the month actually contains it', () => {
    const now = new Date(2026, 7, 19);
    const gridWithToday = buildMonthGrid(now, now);
    expect(gridWithToday.filter((c) => c.isToday)).toHaveLength(1);

    const nextMonth = new Date(2026, 8, 1);
    const gridWithoutToday = buildMonthGrid(nextMonth, now);
    expect(gridWithoutToday.every((c) => !c.isToday)).toBe(true);
  });

  it('flags days strictly before today as past, today itself as not past', () => {
    const now = new Date(2026, 7, 19, 23, 59);
    const grid = buildMonthGrid(now, now);
    const today = grid.find((c) => c.isToday)!;
    expect(today.isPast).toBe(false);
    const yesterday = grid.find((c) => isSameDay(c.date, new Date(2026, 7, 18)))!;
    expect(yesterday.isPast).toBe(true);
  });
});

describe('formatMonthLabel', () => {
  it('capitalizes the French month name', () => {
    expect(formatMonthLabel(new Date(2026, 10, 5))).toBe('Novembre 2026');
  });
});

describe('formatMonthName / formatYearLabel', () => {
  it('splits the heading into a capitalized month and a bare year', () => {
    expect(formatMonthName(new Date(2026, 10, 5))).toBe('Novembre');
    expect(formatYearLabel(new Date(2026, 10, 5))).toBe('2026');
  });
});

describe('firstDayWithSlots', () => {
  it('picks today when it still has slots', () => {
    const now = new Date(2026, 7, 19, 10, 0);
    const days = buildDayOptions(now, 3);
    expect(isSameDay(firstDayWithSlots(days, now).date, now)).toBe(true);
  });

  it('skips to tomorrow once today has no slots left', () => {
    const lateNight = new Date(2026, 7, 19, 23, 45);
    const days = buildDayOptions(lateNight, 3);
    const picked = firstDayWithSlots(days, lateNight);
    expect(isSameDay(picked.date, lateNight)).toBe(false);
  });

  it('falls back to the first day rather than crashing if every day is empty', () => {
    const days = buildDayOptions(new Date(2026, 7, 19), 1).map((d) => ({
      ...d,
      date: new Date(1970, 0, 1),
    }));
    expect(firstDayWithSlots(days, new Date(2026, 7, 19))).toBe(days[0]);
  });
});

describe('formatTime / formatDepartureLabel', () => {
  it('formats time as HH:MM', () => {
    expect(formatTime(new Date(2026, 7, 19, 9, 5))).toMatch(/^\d{2}:\d{2}$/);
  });

  it('labels a same-day value as "Aujourd\'hui, HH:MM"', () => {
    const now = new Date(2026, 7, 19, 8, 0);
    const value = new Date(2026, 7, 19, 14, 30);
    expect(formatDepartureLabel(value, now)).toMatch(/^Aujourd'hui, \d{2}:\d{2}$/);
  });

  it('labels the next calendar day as "Demain, HH:MM"', () => {
    const now = new Date(2026, 7, 19, 8, 0);
    const value = new Date(2026, 7, 20, 9, 0);
    expect(formatDepartureLabel(value, now)).toMatch(/^Demain, \d{2}:\d{2}$/);
  });

  it('labels a further-out day with weekday and date', () => {
    const now = new Date(2026, 7, 19, 8, 0);
    const value = new Date(2026, 7, 25, 9, 0);
    const label = formatDepartureLabel(value, now);
    expect(label).not.toMatch(/Aujourd|Demain/);
    expect(label).toMatch(/\d{2}:\d{2}$/);
  });
});
