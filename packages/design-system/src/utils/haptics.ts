import * as ExpoHaptics from 'expo-haptics';

/**
 * Semantic haptic feedback wrapper. Screens call `haptics.success()` etc.
 * instead of `Haptics.impactAsync(...)` directly, so the mapping from
 * "moment" to feedback intensity lives in one place and can be tuned
 * without touching every call site.
 *
 * expo-haptics throws on platforms/devices without haptic hardware (e.g.
 * web, some Android devices) — every call is fire-and-forget and swallows
 * that failure, since haptic feedback is an enhancement, never something a
 * flow should block or error on.
 */
function fireAndForget(effect: () => Promise<void>): void {
  effect().catch(() => {
    // Haptics are best-effort — no haptic hardware or an unsupported
    // platform is not a real error.
  });
}

export const haptics = {
  /** A flow completed: OTP verified, booking confirmed, ride published. */
  success(): void {
    fireAndForget(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success));
  },
  /** A discrete choice was made: toggling a stop, picking a chip, tapping a tab. */
  selection(): void {
    fireAndForget(() => ExpoHaptics.selectionAsync());
  },
  /** Something needs the user's attention but isn't a hard failure. */
  warning(): void {
    fireAndForget(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning));
  },
  /** A validation or request error. */
  error(): void {
    fireAndForget(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error));
  },
};
