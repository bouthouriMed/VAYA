import * as SecureStore from 'expo-secure-store';

/** The user's appearance choice: follow the OS, or pin one scheme.
 *  `'system'` is the default — a fresh install should feel native, not
 *  opinionated. */
export type AppearancePreference = 'system' | 'light' | 'dark';

const APPEARANCE_KEY = 'vaya.appearance';

const VALID_PREFERENCES: readonly AppearancePreference[] = ['system', 'light', 'dark'];

function isAppearancePreference(value: string | null): value is AppearancePreference {
  return value !== null && (VALID_PREFERENCES as readonly string[]).includes(value);
}

/** Reads the persisted preference. Anything missing or unrecognizable (a
 *  renamed enum after an app update, a corrupted write) falls back to
 *  `'system'` rather than throwing — a storage hiccup must never wedge the
 *  app on startup or force one scheme on everyone. */
export async function loadAppearancePreference(): Promise<AppearancePreference> {
  try {
    const stored = await SecureStore.getItemAsync(APPEARANCE_KEY);
    return isAppearancePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Persists the choice; rejects so the caller can surface a toast on
 *  failure instead of silently pretending it saved. */
export async function saveAppearancePreference(preference: AppearancePreference): Promise<void> {
  await SecureStore.setItemAsync(APPEARANCE_KEY, preference);
}
