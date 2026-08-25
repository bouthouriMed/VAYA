import type { SupportedLocale } from '@vaya/config';

/** BCP-47 tags for `Intl.*`, region-pinned to Tunisia's actual conventions
 *  rather than a generic "ar"/"fr"/"en" — this matters concretely:
 *  `ar-TN` formats numbers with Western (Latin) digits by default, which is
 *  how Tunisia actually writes numbers day-to-day (unlike Gulf Arabic
 *  locales, which default to Eastern Arabic-Indic digits), and both
 *  `ar-TN`/`fr-TN` use the Gregorian calendar, not a religious one. */
const INTL_TAGS: Record<SupportedLocale, string> = {
  en: 'en-GB',
  fr: 'fr-TN',
  ar: 'ar-TN',
};

function tag(locale: SupportedLocale): string {
  return INTL_TAGS[locale];
}

/** Public BCP-47 accessor for callers (design-system primitives, mostly)
 *  that need the raw `Intl`-ready tag rather than one of this file's own
 *  formatting functions — e.g. `DateCalendarSheet`'s `locale` prop. */
export function toIntlTag(locale: SupportedLocale): string {
  return tag(locale);
}

/** VAYA's business currency is always Tunisian Dinar regardless of display
 *  language — this must never be inferred from the UI locale. `Intl`'s
 *  built-in "TND" currency formatting renders inconsistently (and, on some
 *  JS engines, not at all) across en/fr/ar, so the number and the "DT"
 *  suffix are composed explicitly instead — matching the abbreviation
 *  already used throughout the app's hand-written copy. */
export function formatCurrency(amount: number, locale: SupportedLocale): string {
  const number = new Intl.NumberFormat(tag(locale), {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return locale === 'ar' ? `${number} د.ت` : `${number} DT`;
}

export function formatNumber(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(tag(locale)).format(value);
}

export function formatDate(
  date: Date,
  locale: SupportedLocale,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat(tag(locale), options).format(date);
}

export function formatTime(date: Date, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(tag(locale), { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function formatDateTime(date: Date, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

const RELATIVE_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

/** "in 5 minutes" / "il y a 2 heures" / "منذ 3 أيام" — always derived from
 *  `Intl.RelativeTimeFormat`, never string-concatenated, so Arabic's plural
 *  rules and word order come from the platform's real locale data instead
 *  of a hand-rolled guess. */
export function formatRelativeTime(date: Date, locale: SupportedLocale, now: Date = new Date()): string {
  let duration = (date.getTime() - now.getTime()) / 1000;

  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return new Intl.RelativeTimeFormat(tag(locale), { numeric: 'auto' }).format(
        Math.round(duration),
        division.unit,
      );
    }
    duration /= division.amount;
  }
  return new Intl.RelativeTimeFormat(tag(locale), { numeric: 'auto' }).format(Math.round(duration), 'year');
}

/** Distances are always computed in meters server/domain-side; this is the
 *  one place that decides the human-facing unit and rounding per locale.
 *  Tunisia uses metric universally regardless of display language, so this
 *  never branches to imperial units. */
export function formatDistance(meters: number, locale: SupportedLocale): string {
  if (meters < 1000) {
    return `${formatNumber(Math.round(meters / 10) * 10, locale)} m`;
  }
  const km = meters / 1000;
  const rounded = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${formatNumber(rounded, locale)} km`;
}

/** Durations render as a translated "Xh Ymin" / "Xh Ymin" / "Xس Yد" via the
 *  caller's own `t()` composition (see common.json's `time.*` / per-feature
 *  namespaces) — this just does the locale-aware number split so no screen
 *  hand-rolls `Math.floor(minutes / 60)` differently from another. */
export function splitDurationMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return { hours, minutes };
}
