import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from '@vaya/config';

import enCommon from './locales/en/common.json';
import enNavigation from './locales/en/navigation.json';
import enHome from './locales/en/home.json';
import enAuth from './locales/en/auth.json';
import enSearch from './locales/en/search.json';
import enMatching from './locales/en/matching.json';
import enRides from './locales/en/rides.json';
import enBooking from './locales/en/booking.json';
import enDriver from './locales/en/driver.json';
import enPassenger from './locales/en/passenger.json';
import enActiveTrip from './locales/en/activeTrip.json';
import enProfile from './locales/en/profile.json';
import enSettings from './locales/en/settings.json';
import enNotifications from './locales/en/notifications.json';
import enValidation from './locales/en/validation.json';
import enErrors from './locales/en/errors.json';
import enTrips from './locales/en/trips.json';
import enMessages from './locales/en/messages.json';

import frCommon from './locales/fr/common.json';
import frNavigation from './locales/fr/navigation.json';
import frHome from './locales/fr/home.json';
import frAuth from './locales/fr/auth.json';
import frSearch from './locales/fr/search.json';
import frMatching from './locales/fr/matching.json';
import frRides from './locales/fr/rides.json';
import frBooking from './locales/fr/booking.json';
import frDriver from './locales/fr/driver.json';
import frPassenger from './locales/fr/passenger.json';
import frActiveTrip from './locales/fr/activeTrip.json';
import frProfile from './locales/fr/profile.json';
import frSettings from './locales/fr/settings.json';
import frNotifications from './locales/fr/notifications.json';
import frValidation from './locales/fr/validation.json';
import frErrors from './locales/fr/errors.json';
import frTrips from './locales/fr/trips.json';
import frMessages from './locales/fr/messages.json';

import arCommon from './locales/ar/common.json';
import arNavigation from './locales/ar/navigation.json';
import arHome from './locales/ar/home.json';
import arAuth from './locales/ar/auth.json';
import arSearch from './locales/ar/search.json';
import arMatching from './locales/ar/matching.json';
import arRides from './locales/ar/rides.json';
import arBooking from './locales/ar/booking.json';
import arDriver from './locales/ar/driver.json';
import arPassenger from './locales/ar/passenger.json';
import arActiveTrip from './locales/ar/activeTrip.json';
import arProfile from './locales/ar/profile.json';
import arSettings from './locales/ar/settings.json';
import arNotifications from './locales/ar/notifications.json';
import arValidation from './locales/ar/validation.json';
import arErrors from './locales/ar/errors.json';
import arTrips from './locales/ar/trips.json';
import arMessages from './locales/ar/messages.json';

export const NAMESPACES = [
  'common',
  'navigation',
  'home',
  'auth',
  'search',
  'matching',
  'rides',
  'booking',
  'driver',
  'passenger',
  'activeTrip',
  'profile',
  'settings',
  'notifications',
  'validation',
  'errors',
  'trips',
  'messages',
] as const;

export const resources = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    home: enHome,
    auth: enAuth,
    search: enSearch,
    matching: enMatching,
    rides: enRides,
    booking: enBooking,
    driver: enDriver,
    passenger: enPassenger,
    activeTrip: enActiveTrip,
    profile: enProfile,
    settings: enSettings,
    notifications: enNotifications,
    validation: enValidation,
    errors: enErrors,
    trips: enTrips,
    messages: enMessages,
  },
  fr: {
    common: frCommon,
    navigation: frNavigation,
    home: frHome,
    auth: frAuth,
    search: frSearch,
    matching: frMatching,
    rides: frRides,
    booking: frBooking,
    driver: frDriver,
    passenger: frPassenger,
    activeTrip: frActiveTrip,
    profile: frProfile,
    settings: frSettings,
    notifications: frNotifications,
    validation: frValidation,
    errors: frErrors,
    trips: frTrips,
    messages: frMessages,
  },
  ar: {
    common: arCommon,
    navigation: arNavigation,
    home: arHome,
    auth: arAuth,
    search: arSearch,
    matching: arMatching,
    rides: arRides,
    booking: arBooking,
    driver: arDriver,
    passenger: arPassenger,
    activeTrip: arActiveTrip,
    profile: arProfile,
    settings: arSettings,
    notifications: arNotifications,
    validation: arValidation,
    errors: arErrors,
    trips: arTrips,
    messages: arMessages,
  },
} as const;

/** Picks the best startup locale from the device's ordered locale list —
 *  the first one VAYA actually supports, never a blind "first entry" read
 *  (a device set to, say, Italian-then-French should land on French, not
 *  fall straight through to the default). Used only as the *first-run*
 *  guess; once a user has an explicit choice persisted (languageStorage.ts)
 *  that always wins instead — see languageSlice.ts / _layout.tsx. */
export function detectDeviceLocale(): SupportedLocale {
  const deviceLocales = Localization.getLocales();
  for (const { languageCode } of deviceLocales) {
    const match = SUPPORTED_LOCALES.find((locale) => locale === languageCode);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

let initialized = false;

/** Initializes i18next exactly once. Safe to call multiple times (e.g. from
 *  fast refresh) — only the first call actually runs `.init()`. */
export function initI18n(initialLocale: SupportedLocale): typeof i18n {
  if (initialized) return i18n;
  initialized = true;

  void i18n.use(initReactI18next).init({
    resources,
    lng: initialLocale,
    fallbackLng: DEFAULT_LOCALE,
    ns: NAMESPACES,
    defaultNS: 'common',
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    interpolation: {
      escapeValue: false, // React already escapes; double-escaping breaks Arabic punctuation.
    },
    compatibilityJSON: 'v4',
    returnEmptyString: false,
  });

  return i18n;
}

export default i18n;
