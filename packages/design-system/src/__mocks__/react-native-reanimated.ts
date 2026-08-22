// Real react-native-reanimated needs a native runtime (the "worklet"
// UI-thread engine) — not resolvable in the vitest 'node' test environment.
// A snapshot test captures one static frame, so these mocks only need to
// synchronously settle to a value and not throw — no actual animation runs.

export function useSharedValue<T>(initial: T): { value: T } {
  return { value: initial };
}

export function useAnimatedStyle<T>(factory: () => T): T {
  return factory();
}

interface WithConfigCallback {
  (finished: boolean): void;
}

export function withSpring<T>(toValue: T, _config?: unknown, callback?: WithConfigCallback): T {
  callback?.(true);
  return toValue;
}

export function withTiming<T>(toValue: T, _config?: unknown, callback?: WithConfigCallback): T {
  callback?.(true);
  return toValue;
}

export function runOnJS<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return fn;
}

export const Easing = {
  linear: (t: number): number => t,
  ease: (t: number): number => t,
  in: () => (t: number) => t,
  out: () => (t: number) => t,
  inOut: () => (t: number) => t,
};

// Mirrors __mocks__/react-native.ts's pattern (opaque element-type strings)
// — Animated.View/Text/ScrollView are never actually rendered here, only
// imported/instantiated for smoke and snapshot tests.
const Animated = {
  View: 'Animated.View',
  Text: 'Animated.Text',
  ScrollView: 'Animated.ScrollView',
  createAnimatedComponent: <T,>(component: T): T => component,
};

export default Animated;
