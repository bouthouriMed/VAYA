import { DevSettings, Platform } from 'react-native';

/** Reloads the JS bundle in development on Android, where
 *  `DevSettings.reload()` reliably brings the app back up with the new
 *  layout direction. Not on iOS: reloading Expo Go right after an RTL flip
 *  comes back before its native modules are re-registered ("Cannot find
 *  native module 'ExpoAsset'" → "main has not been registered"), crashing
 *  the app. There is no `expo-updates` dependency in this app (a deliberate
 *  choice — see this file's callers), so production has no in-app reload
 *  mechanism either; callers fall back to an honest "please restart the
 *  app" prompt instead of pretending this can do it silently. Returns
 *  whether it actually reloaded. */
export function tryReloadApp(): boolean {
  if (__DEV__ && Platform.OS === 'android' && typeof DevSettings?.reload === 'function') {
    DevSettings.reload();
    return true;
  }
  return false;
}
