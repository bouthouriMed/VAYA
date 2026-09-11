export const APP_NAME = 'VAYA';
export const APP_DESCRIPTION = 'Carpooling marketplace for Tunisia';

export const API_VERSION = 'v1';

export const SUPPORTED_LOCALES = ['en', 'fr', 'ar'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** The locale a real user actually sees when their device's own locale
 *  isn't one VAYA supports (apps/mobile/src/services/i18n/index.ts's
 *  `selectLocale`), and i18next's `fallbackLng` for a missing translation
 *  key. VAYA is a Tunisia-market product — French, not English, is the
 *  correct default for a device locale this app doesn't otherwise
 *  recognize (this constant's own test, `constants.test.ts`, has always
 *  asserted 'fr'; it had silently drifted to 'en' with no CI ever running
 *  this test to catch it). */
export const DEFAULT_LOCALE: SupportedLocale = 'fr';

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
