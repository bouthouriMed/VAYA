export const APP_NAME = 'VAYA';
export const APP_DESCRIPTION = 'Carpooling marketplace for Tunisia';

export const API_VERSION = 'v1';

export const SUPPORTED_LOCALES = ['fr', 'ar', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'fr';

export const TUNISIA_TIMEZONE = 'Africa/Tunis';
