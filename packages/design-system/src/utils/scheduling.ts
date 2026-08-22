/** Date/time picking helpers shared by DepartureTimeSheet and any screen
 *  that needs a "when" field (ride creation, ride search) — kept generic
 *  and dependency-free so they're usable outside the sheet too (e.g. a
 *  screen's trigger label) and directly unit-testable without a renderer. */

export interface DayOption {
  /** Local midnight for this day — used as the option's identity/key. */
  date: Date;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "HH:MM" in the app's one supported locale (matches the formatting
 *  already used across trips.tsx/notifications/conversationHelpers). */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** "Aujourd'hui, 14:30" / "Demain, 09:00" / "mer. 21 août, 18:15" — the
 *  label shown on a screen's "when" trigger field once a value is chosen. */
export function formatDepartureLabel(date: Date, now: Date = new Date()): string {
  const time = formatTime(date);
  if (isSameDay(date, now)) return `Aujourd'hui, ${time}`;
  const tomorrow = new Date(now.getTime() + DAY_MS);
  if (isSameDay(date, tomorrow)) return `Demain, ${time}`;
  const day = date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${day}, ${time}`;
}

/** The next `count` days starting today, each labeled for a day-picker chip
 *  row ("Aujourd'hui" / "Demain" / "mer. 21"). */
export function buildDayOptions(now: Date = new Date(), count = 14): DayOption[] {
  const today = startOfDay(now);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today.getTime() + i * DAY_MS);
    if (i === 0) return { date, label: "Aujourd'hui" };
    if (i === 1) return { date, label: 'Demain' };
    return {
      date,
      label: date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
    };
  });
}

/** Rounds `date` up to the next boundary of `slotMinutes` — e.g. 14:07 with
 *  a 30-minute grid becomes 14:30. Never rounds down: a departure time must
 *  never land in the past. */
export function roundUpToSlot(date: Date, slotMinutes: number): Date {
  const ms = slotMinutes * 60_000;
  const rounded = Math.ceil(date.getTime() / ms) * ms;
  return new Date(rounded);
}

/** Selectable time-of-day slots for a given day, on a `slotMinutes` grid
 *  between `dayStartHour` and `dayEndHour`. When `day` is today, slots
 *  before `now` (rounded up to the grid) are omitted — a past time is never
 *  offered, so the picker itself enforces "no invalid departure" instead of
 *  relying on a validation error after the fact. Can return an empty array
 *  (e.g. it's 23:50 and the day's last slot has already passed) — callers
 *  should fall back to the next day's options in that case. */
export function buildTimeOptions(
  day: Date,
  now: Date = new Date(),
  slotMinutes = 30,
  dayStartHour = 6,
  dayEndHour = 23.5,
): Date[] {
  const base = startOfDay(day);
  const dayStart = new Date(base.getTime() + dayStartHour * 60 * 60_000);
  const dayEnd = new Date(base.getTime() + dayEndHour * 60 * 60_000);
  const earliest = isSameDay(day, now)
    ? new Date(Math.max(roundUpToSlot(now, slotMinutes).getTime(), dayStart.getTime()))
    : dayStart;

  const slots: Date[] = [];
  for (let cursor = earliest; cursor.getTime() <= dayEnd.getTime();) {
    slots.push(cursor);
    cursor = new Date(cursor.getTime() + slotMinutes * 60_000);
  }
  return slots;
}

export interface MonthGridCell {
  date: Date;
  /** false for the leading/trailing days of adjacent months shown to fill
   *  the grid — rendered dimmed/inert, never selectable. */
  isCurrentMonth: boolean;
  isToday: boolean;
  /** A past day (before today) is never selectable — a departure can't be
   *  in the past. */
  isPast: boolean;
}

/** A Monday-first (French convention) 6-row x 7-col month grid for
 *  `anchor`'s month, including the adjacent-month days needed to fill the
 *  first/last week — the shape a real calendar UI renders, not just a list
 *  of same-month days. Always exactly 42 cells (6 full weeks) so a
 *  caller's layout never reflows between months. */
export function buildMonthGrid(anchor: Date, now: Date = new Date()): MonthGridCell[] {
  const today = startOfDay(now);
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  // getDay(): 0=Sun..6=Sat. Convert to a Monday-first offset (0=Mon..6=Sun).
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth.getTime() - mondayOffset * DAY_MS);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart.getTime() + i * DAY_MS);
    return {
      date,
      isCurrentMonth: date.getMonth() === anchor.getMonth(),
      isToday: isSameDay(date, today),
      isPast: date.getTime() < today.getTime(),
    };
  });
}

/** "novembre 2023" — the calendar grid's month/year heading. */
export function formatMonthLabel(date: Date): string {
  const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Picks the first day in `days` that still has at least one time slot —
 *  the sensible default selection when opening the sheet (skips a "today"
 *  option that's already past its last slot for the day). Falls back to
 *  the first day if every day is somehow empty (shouldn't happen with a
 *  multi-day window, but never crashes). */
export function firstDayWithSlots(days: DayOption[], now: Date = new Date()): DayOption {
  for (const day of days) {
    if (buildTimeOptions(day.date, now).length > 0) return day;
  }
  return days[0]!;
}
