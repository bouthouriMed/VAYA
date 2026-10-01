import type { TFunction } from 'i18next';
import { splitDurationMinutes } from './localeFormat';

/**
 * The one human-readable duration: "45 min", "2 h", "19 h 40", "2 jours".
 * Raw minute counts ("Part 1139 min après l'heure demandée") are never
 * shown to a person. Rounds to the nearest 5 minutes past the first hour
 * and to whole days past 24 hours — precise enough to decide, short enough
 * to read.
 */
export function formatDurationLabel(t: TFunction, totalMinutes: number): string {
  const minutesAbs = Math.max(0, Math.round(totalMinutes));
  if (minutesAbs < 60) return t('common:duration.minutes', { count: minutesAbs });
  if (minutesAbs >= 24 * 60) {
    return t('common:duration.days', { count: Math.round(minutesAbs / (24 * 60)) });
  }
  const rounded = Math.round(minutesAbs / 5) * 5;
  const { hours, minutes } = splitDurationMinutes(rounded);
  if (minutes === 0) return t('common:duration.hours', { count: hours });
  return t('common:duration.hoursMinutes', { hours, minutes: String(minutes).padStart(2, '0') });
}
