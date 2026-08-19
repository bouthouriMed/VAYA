import * as SecureStore from 'expo-secure-store';

// Mirrors services/auth/tokenStorage.ts's pattern: a small SecureStore
// wrapper, one concern per file. This flag remembers whether the app has
// already asked the OS for push permission (contextually — see
// registerForPushNotifications.ts) so it's asked at most once per install,
// regardless of which of the two trigger points (first ride publish, first
// booking) fires first.
const PROMPTED_KEY = 'vaya.pushPermissionPrompted';

export async function hasPromptedForPushPermission(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(PROMPTED_KEY);
  return value === 'true';
}

export async function markPromptedForPushPermission(): Promise<void> {
  await SecureStore.setItemAsync(PROMPTED_KEY, 'true');
}
