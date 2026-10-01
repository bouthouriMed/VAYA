import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { formatDurationLabel } from '../durationLabel';

const t = ((key: string, opts: Record<string, unknown>) => `${key}|${JSON.stringify(opts)}`) as unknown as TFunction;

describe('formatDurationLabel', () => {
  it('keeps short durations in minutes', () => {
    expect(formatDurationLabel(t, 4)).toBe('common:duration.minutes|{"count":4}');
  });

  it('renders hours and minutes instead of a raw minute count', () => {
    expect(formatDurationLabel(t, 1139)).toBe('common:duration.hours|{"count":19}');
    expect(formatDurationLabel(t, 1176)).toBe('common:duration.hoursMinutes|{"hours":19,"minutes":"35"}');
    expect(formatDurationLabel(t, 88)).toBe('common:duration.hoursMinutes|{"hours":1,"minutes":"30"}');
    expect(formatDurationLabel(t, 120)).toBe('common:duration.hours|{"count":2}');
  });

  it('switches to days past 24 hours', () => {
    expect(formatDurationLabel(t, 2 * 24 * 60 + 30)).toBe('common:duration.days|{"count":2}');
  });
});
