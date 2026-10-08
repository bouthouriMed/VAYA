import type { PermissionStatus } from 'expo-notifications';

/**
 * Whether to show the OS push-permission dialog. Only when the OS itself
 * says the user has never answered ('undetermined') — the user is asked at
 * most once per install, and a refusal is respected. The OS status is the
 * source of truth rather than an app-side "already asked" flag: such a flag
 * in SecureStore survives an iOS reinstall (keychain) while the OS
 * permission resets, which left reinstalled apps never asking again.
 */
export function shouldPromptForPushPermission(status: PermissionStatus | 'unavailable'): boolean {
  return status === 'undetermined';
}
