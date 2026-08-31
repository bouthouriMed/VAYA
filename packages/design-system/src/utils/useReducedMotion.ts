import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS-level "Reduce Motion" accessibility setting, live.
 *
 * Reanimated's `withSpring`/`withTiming` already default to
 * `ReduceMotion.System` and jump straight to the end value under this
 * setting — most animated primitives need nothing extra. This hook is for
 * the smaller set of call sites that branch in JS instead of driving a
 * style value: skipping a staggered list entrance, choosing an instant vs.
 * animated layout mode, disabling a decorative auto-advancing sequence.
 *
 * Mirrors the one-off pattern StepProgress.tsx used locally, extracted so
 * it isn't hand-rolled again per component, plus a live listener so a
 * setting change while the app is open (not just app-launch) is honoured.
 */
export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
