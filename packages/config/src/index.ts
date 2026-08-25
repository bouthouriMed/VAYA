export const APP_NAME = 'VAYA';
export const APP_DESCRIPTION = 'Carpooling marketplace for Tunisia';

export const API_VERSION = 'v1';

export const SUPPORTED_LOCALES = ['en', 'fr', 'ar'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** English is the i18n system's source/fallback language — every
 *  translation key originates here and every namespace resolves to this
 *  locale if a key is missing elsewhere. It is NOT necessarily what a given
 *  user sees: actual locale selection is device-locale-aware and falls back
 *  to this only when the device locale isn't one VAYA supports. See
 *  apps/mobile/src/services/i18n/index.ts for the selection logic. */
export const DEFAULT_LOCALE: SupportedLocale = 'en';

/** Locales that render right-to-left. Currently just Arabic, but kept as a
 *  set (not a boolean) so a future RTL locale doesn't need call sites
 *  rewritten. */
export const RTL_LOCALES: readonly SupportedLocale[] = ['ar'];

export function isRtlLocale(locale: SupportedLocale): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}

/** Each language's own name, in its own script — never translated, always
 *  shown in this exact form regardless of the active UI language (a
 *  language picker should read the same no matter which language is
 *  currently selected). */
export const LOCALE_NATIVE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  fr: 'Français',
  ar: 'العربية',
};

export const TUNISIA_TIMEZONE = 'Africa/Tunis';
