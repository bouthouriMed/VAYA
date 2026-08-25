import * as SecureStore from 'expo-secure-store';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@vaya/config';

const LANGUAGE_KEY = 'vaya.language';

function isSupportedLocale(value: string | null): value is SupportedLocale {
  return value !== null && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Reads the user's explicit language choice, if any. `null` (not a
 *  fallback locale) means "never explicitly chosen" — the caller must tell
 *  this apart from an explicit English choice so first-run device-locale
 *  detection (see i18n/index.ts's detectDeviceLocale) only ever runs once,
 *  and a returning user's choice is never silently overridden. */
export async function loadLanguagePreference(): Promise<SupportedLocale | null> {
  try {
    const stored = await SecureStore.getItemAsync(LANGUAGE_KEY);
    return isSupportedLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Persists the choice; rejects so the caller can surface a toast on
 *  failure instead of silently pretending it saved. */
export async function saveLanguagePreference(locale: SupportedLocale): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, locale);
}
