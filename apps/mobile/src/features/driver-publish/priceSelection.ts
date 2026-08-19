/**
 * Deliberately not imported from `@vaya/design-system`: that package's
 * entrypoint pulls in the real `react-native` module graph (Flow-typed
 * source), which apps/mobile's plain Node/Vite test environment (no RN
 * preset configured — see stopSelection.test.ts's established pattern of
 * testing extracted logic without a rendering harness) can't parse. This
 * one-line clamp is the exact same logic as `PriceRangeStepper`'s exported
 * `clampPrice` (packages/design-system/src/primitives/PriceRangeStepper.tsx)
 * — keep the two in sync if the bound-clamping rule ever changes.
 */
function clampPrice(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Applies a +/- step to the current price and clamps the result into
 * `[min, max]` — mirrors `driver/publish.tsx`'s price step so it can be
 * unit-tested without a React Native rendering harness (mirrors
 * stopSelection.ts's established pattern: extract screen logic into
 * `features/`, test it directly).
 *
 * Phase 6 (docs/roadmap/phase-06-pricing-engine.md): "no separate
 * validation-error state should ever be reachable for price, since the UI
 * makes an out-of-bounds value unrepresentable" — this is the function
 * that guarantees that for the increment/decrement interaction.
 */
export function stepPrice(
  current: number,
  direction: 1 | -1,
  min: number,
  max: number,
  step = 0.5,
): number {
  const stepped = Math.round((current + direction * step) * 100) / 100;
  return clampPrice(stepped, min, max);
}

/** The price step always opens on the server's `recommended` value —
 *  never an arbitrary default — but still clamps defensively in case a
 *  malformed response ever put `recommended` outside `[min, max]`. */
export function resolveInitialPrice(min: number, recommended: number, max: number): number {
  return clampPrice(recommended, min, max);
}
