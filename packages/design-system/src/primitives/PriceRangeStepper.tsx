import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radii, typography } from '../tokens/index';
import { haptics } from '../utils/haptics';

const DEFAULT_STEP_DT = 0.5;

/** Clamps a candidate price into `[min, max]` — the single source of truth
 *  for "an out-of-bounds value is unrepresentable" (docs/roadmap/phase-06
 *  -pricing-engine.md's UX behavior section). Exported so both this
 *  component and any screen driving it (`driver/publish.tsx`) can reuse
 *  the exact same clamp instead of each re-deriving it slightly
 *  differently. Pure function — trivially unit-testable without rendering. */
export function clampPrice(value: number, min: number, max: number): number {
  if (max < min) return min; // defensive: a malformed bound never crashes the UI
  return Math.min(max, Math.max(min, value));
}

interface PriceRangeStepperProps {
  /** Lower bound of the server-computed suggestion — the control can never
   *  go below this. */
  min: number;
  /** Upper bound of the server-computed suggestion — the control can never
   *  go above this. */
  max: number;
  /** The server's suggested value — shown as a labeled reference point on
   *  the range track, distinct from the driver's current `value`. */
  recommended: number;
  /** Current (possibly driver-adjusted) price. Always clamped to
   *  `[min, max]` before being displayed, so a stale out-of-range value
   *  passed in by a caller can never render as selectable. */
  value: number;
  onChange: (value: number) => void;
  /** DT increment per tap. Defaults to 0.5 DT. */
  step?: number;
  /** True when `min`/`max` came from a haversine-fallback route estimate
   *  (docs/domain/pricing.md's "Route not yet computed" edge case) — shown
   *  as an honest caption, never hidden. */
  isEstimate?: boolean;
  label?: string;
}

/** Bounded price control (capped stepper + visual range indicator) —
 *  Phase 6's replacement for driver/publish.tsx's old unbounded ±1
 *  stepper. Deliberately not a drag-gesture slider: a clamped stepper with
 *  a position-indicating track meets the same "can't produce an
 *  out-of-bounds value" requirement (docs/roadmap/phase-06-pricing-engine.md)
 *  without a new gesture-handling dependency, and reuses Input's bordered,
 *  numeric-entry visual language (see Input.tsx) for the value display. */
export function PriceRangeStepper({
  min,
  max,
  recommended,
  value,
  onChange,
  step = DEFAULT_STEP_DT,
  isEstimate = false,
  label = 'Contribution par place',
}: PriceRangeStepperProps): React.JSX.Element {
  const clamped = clampPrice(value, min, max);
  const span = max - min;
  const ratio = span > 0 ? (clamped - min) / span : 0.5;
  const recommendedRatio = span > 0 ? (clampPrice(recommended, min, max) - min) / span : 0.5;

  const atMin = clamped <= min;
  const atMax = clamped >= max;

  function decrement(): void {
    haptics.selection();
    onChange(clampPrice(Math.round((clamped - step) * 100) / 100, min, max));
  }
  function increment(): void {
    haptics.selection();
    onChange(clampPrice(Math.round((clamped + step) * 100) / 100, min, max));
  }

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={[styles.stepperBtn, atMin && styles.stepperBtnDisabled]}
          onPress={decrement}
          disabled={atMin}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Diminuer la contribution"
          accessibilityState={{ disabled: atMin }}
        >
          <Text style={styles.stepperGlyph}>−</Text>
        </TouchableOpacity>

        <View style={styles.valueBox}>
          <Text style={styles.valueText}>{clamped} DT</Text>
        </View>

        <TouchableOpacity
          style={[styles.stepperBtn, atMax && styles.stepperBtnDisabled]}
          onPress={increment}
          disabled={atMax}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Augmenter la contribution"
          accessibilityState={{ disabled: atMax }}
        >
          <Text style={styles.stepperGlyph}>+</Text>
        </TouchableOpacity>
      </View>

      <View
        style={styles.track}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        // React Native's accessibilityValue bridges min/max/now to a native
        // integer type — a fractional DT amount here (e.g. a recommended
        // price of 176.5) crashes Fabric's prop conversion with "Loss of
        // precision during arithmetic conversion". Rounding is accessibility
        // metadata only; the real (possibly fractional) price is still what
        // renders and what's submitted.
        accessibilityValue={{ min: Math.round(min), max: Math.round(max), now: Math.round(clamped) }}
      >
        <View style={[styles.recommendedMarker, { left: `${recommendedRatio * 100}%` }]} />
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
        <View style={[styles.thumb, { left: `${ratio * 100}%` }]} />
      </View>

      <View style={styles.captionRow}>
        <Text style={styles.caption}>{min} DT</Text>
        <Text style={styles.captionRecommended}>Suggéré : {recommended} DT</Text>
        <Text style={styles.caption}>{max} DT</Text>
      </View>

      {isEstimate ? (
        <Text style={styles.estimateNote}>
          Estimation basée sur la distance à vol d&apos;oiseau — la marge est plus large tant que
          l&apos;itinéraire réel n&apos;est pas confirmé.
        </Text>
      ) : null}
    </View>
  );
}

const THUMB_SIZE = 20;

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray700,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.gray300,
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperGlyph: {
    fontSize: typography.fontSize.xl,
    color: colors.gray800,
  },
  valueBox: {
    minWidth: 96,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  valueText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray900,
  },
  track: {
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.trustBarTrack,
    marginTop: spacing.xs,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: '100%',
    borderRadius: radii.full,
    backgroundColor: colors.trustBarFill,
  },
  recommendedMarker: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 14,
    backgroundColor: colors.gray500,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    marginLeft: -THUMB_SIZE / 2,
    backgroundColor: colors.secondary,
    borderWidth: 2,
    borderColor: colors.white,
  },
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  caption: {
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
  },
  captionRecommended: {
    fontSize: typography.fontSize.xs,
    color: colors.gray600,
    fontWeight: typography.fontWeight.medium,
  },
  estimateNote: {
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    marginTop: spacing.xs,
  },
});
