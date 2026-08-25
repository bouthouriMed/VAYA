import { DevSettings } from 'react-native';

/** Reloads the JS bundle in development, where `DevSettings.reload()` is
 *  always available. There is no `expo-updates` dependency in this app (a
 *  deliberate choice — see this file's callers), so production has no
 *  in-app reload mechanism; callers must fall back to an honest "please
 *  restart the app" prompt instead of pretending this can do it silently.
 *  Returns whether it actually reloaded. */
export function tryReloadApp(): boolean {
  if (__DEV__ && typeof DevSettings?.reload === 'function') {
    DevSettings.reload();
    return true;
  }
  return false;
}
