import { Easing } from 'react-native-reanimated';

/**
 * Shared motion vocabulary for every animated primitive/screen — the same
 * role `elevation`/`colors` play for shadows/color. Keeps VAYA's motion
 * "controlled and fast, never bouncy" (per the brand's soft-but-confident
 * character) instead of every screen hand-tuning its own spring.
 *
 * `springs.gentle` is BottomSheet's original hand-tuned config, unchanged —
 * every other preset is derived from it (same critically-damped, no-overshoot
 * character, just lighter/heavier) so adopting these tokens doesn't change
 * BottomSheet's feel, it just gives the rest of the app the same one.
 *
 * Every Reanimated `withSpring`/`withTiming` call already defaults to
 * `ReduceMotion.System` — under the OS "Reduce Motion" setting it jumps
 * straight to the end value with no extra code. `useReducedMotion` (in
 * `utils/`) is only for the handful of call sites that need to branch in JS
 * (skip a staggered entrance sequence, choose an instant vs. animated layout
 * mode) rather than drive a style value.
 */

// damping must be >= ~2*sqrt(stiffness) to be critically damped (no bounce).
// All three presets stay comfortably above that line.
export const springs = {
  /** Buttons, chips, toggles, selection state — small travel, near-instant. */
  snappy: { damping: 24, stiffness: 320, mass: 0.7, overshootClamping: true },
  /** Sheets, cards, expanding sections. BottomSheet's original tuning. */
  gentle: { damping: 28, stiffness: 180, overshootClamping: true },
  /** Large layout shifts, hero elements, map camera moves — heavier, unhurried. */
  settle: { damping: 30, stiffness: 120, mass: 1.1, overshootClamping: true },
} as const;

export type SpringPreset = keyof typeof springs;

/** Millisecond durations for `withTiming`/`Animated.timing` fades and morphs. */
export const durations = {
  instant: 100,
  fast: 160,
  base: 220,
  moderate: 320,
  slow: 420,
} as const;

export type DurationToken = keyof typeof durations;

/** Named easing curves, used with `durations` above for non-spring timing. */
export const easings = {
  /** Symmetric — color/value morphs where neither end is the "arrival". */
  standard: Easing.inOut(Easing.cubic),
  /** Entrances — starts fast, settles in. */
  decelerate: Easing.out(Easing.cubic),
  /** Exits — starts gentle, leaves fast. */
  accelerate: Easing.in(Easing.cubic),
} as const;

/**
 * Per-item delay (ms) for a staggered list entrance, capped so a long list
 * doesn't keep the last visible row waiting on an ever-growing queue —
 * only the first `maxItems` rows stagger, the rest enter together with them.
 */
export function staggerDelay(index: number, step = 40, maxItems = 5): number {
  return Math.min(index, maxItems) * step;
}
