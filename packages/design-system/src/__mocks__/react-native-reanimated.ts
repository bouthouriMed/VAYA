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

// Real reanimated returns an opaque native-thread scroll-event handler; a
// snapshot test never dispatches an actual scroll event, so this just needs
// to be a value that's valid to pass as an `onScroll` prop and never throws.
export function useAnimatedScrollHandler<T>(handlers: T): T {
  return handlers;
}

export const Extrapolation = {
  EXTEND: 'extend',
  CLAMP: 'clamp',
  IDENTITY: 'identity',
} as const;

// A real (if simplified) linear interpolation, not a stub — TimeWheelSheet's
// per-row `useAnimatedStyle` factory runs synchronously under this mock
// (see `useAnimatedStyle` above) and its output values (scale/opacity) land
// directly in the snapshot, so this needs to produce real, order-correct
// numbers, not a placeholder.
export function interpolate(
  value: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate?: unknown,
): number {
  const [inStart, inEnd] = [inputRange[0]!, inputRange[inputRange.length - 1]!];
  const [outStart, outEnd] = [outputRange[0]!, outputRange[outputRange.length - 1]!];
  const t = inEnd === inStart ? 0 : (value - inStart) / (inEnd - inStart);
  const result = outStart + t * (outEnd - outStart);
  const shouldClamp =
    extrapolate === Extrapolation.CLAMP || extrapolate === undefined || (typeof extrapolate === 'object' && extrapolate !== null && 'extrapolateRight' in extrapolate);
  if (!shouldClamp) return result;
  const [min, max] = outStart <= outEnd ? [outStart, outEnd] : [outEnd, outStart];
  return Math.min(Math.max(result, min), max);
}

// Real color blending isn't meaningful in a static-frame mock — picks
// whichever endpoint the (already-clamped) progress is closer to, which is
// enough for a snapshot to be deterministic and non-throwing.
export function interpolateColor(
  value: number,
  inputRange: readonly number[],
  outputColorRange: readonly string[],
): string {
  const t = Math.min(Math.max(value, inputRange[0]!), inputRange[inputRange.length - 1]!);
  const midpoint = (inputRange[0]! + inputRange[inputRange.length - 1]!) / 2;
  return t <= midpoint ? outputColorRange[0]! : outputColorRange[outputColorRange.length - 1]!;
}

export const Easing = {
  linear: (t: number): number => t,
  ease: (t: number): number => t,
  in: () => (t: number) => t,
  out: () => (t: number) => t,
  inOut: () => (t: number) => t,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Real reanimated's layout-animation presets (FadeInDown, ZoomIn, ...) are
// builder objects whose chained config calls (.delay(), .springify(),
// .damping(), ...) return the same builder, ultimately used as an opaque
// `entering`/`exiting` prop value — never actually run in a static-frame
// snapshot test. Each listed method just returns the same builder; a Proxy
// covering arbitrary method names was tried first but intercepts
// `toString`/`valueOf`/etc. too, which broke pretty-format's snapshot
// serialization ("Cannot convert object to primitive value").
const LAYOUT_ANIMATION_CHAIN_METHODS = [
  'delay',
  'duration',
  'springify',
  'damping',
  'dampingRatio',
  'stiffness',
  'mass',
  'overshootClamping',
  'restDisplacementThreshold',
  'restSpeedThreshold',
  'easing',
  'randomDelay',
  'withInitialValues',
  'reduceMotion',
] as const;

type LayoutAnimationBuilder = Record<(typeof LAYOUT_ANIMATION_CHAIN_METHODS)[number], () => LayoutAnimationBuilder>;

function createLayoutAnimationBuilder(): LayoutAnimationBuilder {
  const builder = {} as LayoutAnimationBuilder;
  for (const method of LAYOUT_ANIMATION_CHAIN_METHODS) {
    builder[method] = () => builder;
  }
  return builder;
}

export const FadeIn = createLayoutAnimationBuilder();
export const FadeInDown = createLayoutAnimationBuilder();
export const FadeInUp = createLayoutAnimationBuilder();
export const FadeInLeft = createLayoutAnimationBuilder();
export const FadeInRight = createLayoutAnimationBuilder();
export const FadeOut = createLayoutAnimationBuilder();
export const FadeOutDown = createLayoutAnimationBuilder();
export const FadeOutUp = createLayoutAnimationBuilder();
export const ZoomIn = createLayoutAnimationBuilder();
export const ZoomOut = createLayoutAnimationBuilder();
export const SlideInDown = createLayoutAnimationBuilder();
export const SlideInUp = createLayoutAnimationBuilder();
export const SlideOutDown = createLayoutAnimationBuilder();
export const SlideOutUp = createLayoutAnimationBuilder();

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
