import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, radii, typography } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import { Icon } from './Icon';
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

export interface PriceRangeStepperLabels {
  decrease: string;
  increase: string;
  /** Receives the formatted recommended price, e.g. "Suggéré : 14 DT". */
  suggested: (formattedPrice: string) => string;
  estimateNote: string;
}

const DEFAULT_LABELS: PriceRangeStepperLabels = {
  decrease: 'Diminuer la contribution',
  increase: 'Augmenter la contribution',
  suggested: (price) => `Suggéré : ${price}`,
  estimateNote:
    "Estimation basée sur la distance à vol d'oiseau — la marge est plus large tant que l'itinéraire réel n'est pas confirmé.",
};

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
  /** Localized copy — pass the app's translations. */
  labels?: Partial<PriceRangeStepperLabels>;
  /** Formats a price for display — pass the app's currency formatter. */
  formatValue?: (value: number) => string;
}

/** Bounded price control (capped stepper + visual range indicator) —
 *  Phase 6's replacement for the old unbounded ±1 stepper. Deliberately
 *  not a drag-gesture slider: a clamped stepper with a position-indicating
 *  track meets the same "can't produce an out-of-bounds value" requirement
 *  without a gesture dependency. */
export function PriceRangeStepper({
  min,
  max,
  recommended,
  value,
  onChange,
  step = DEFAULT_STEP_DT,
  isEstimate = false,
  label = 'Contribution par place',
  labels: labelOverrides,
  formatValue = (n) => `${n} DT`,
}: PriceRangeStepperProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
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

  const stepperBtn = [styles.stepperBtn, { backgroundColor: theme.surface, borderColor: theme.outline }];

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: theme.inkMuted }]}>{label}</Text> : null}

      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={[stepperBtn, atMin && styles.stepperBtnDisabled]}
          onPress={decrement}
          disabled={atMin}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={labels.decrease}
          accessibilityState={{ disabled: atMin }}
        >
          <Icon name="remove" size="sm" color={theme.ink} />
        </TouchableOpacity>

        <View style={[styles.valueBox, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          <Text style={[styles.valueText, { color: theme.ink }]}>{formatValue(clamped)}</Text>
        </View>

        <TouchableOpacity
          style={[stepperBtn, atMax && styles.stepperBtnDisabled]}
          onPress={increment}
          disabled={atMax}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={labels.increase}
          accessibilityState={{ disabled: atMax }}
        >
          <Icon name="add" size="sm" color={theme.ink} />
        </TouchableOpacity>
      </View>

      <View
        style={[styles.track, { backgroundColor: theme.outlineVariant }]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        // React Native's accessibilityValue bridges min/max/now to a native
        // integer type — a fractional DT amount here crashes Fabric's prop
        // conversion. Rounding is accessibility metadata only.
        accessibilityValue={{ min: Math.round(min), max: Math.round(max), now: Math.round(clamped) }}
      >
        <View style={[styles.recommendedMarker, { left: `${recommendedRatio * 100}%`, backgroundColor: theme.inkFaint }]} />
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: theme.accent }]} />
        <View style={[styles.thumb, { left: `${ratio * 100}%`, backgroundColor: theme.accent, borderColor: theme.surface }]} />
      </View>

      <View style={styles.captionRow}>
        <Text style={[styles.caption, { color: theme.inkFaint }]}>{formatValue(min)}</Text>
        <Text style={[styles.captionRecommended, { color: theme.inkMuted }]}>{labels.suggested(formatValue(recommended))}</Text>
        <Text style={[styles.caption, { color: theme.inkFaint }]}>{formatValue(max)}</Text>
      </View>

      {isEstimate ? <Text style={[styles.estimateNote, { color: theme.inkFaint }]}>{labels.estimateNote}</Text> : null}
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
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  valueBox: {
    minWidth: 112,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  valueText: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
  },
  track: {
    height: 8,
    borderRadius: radii.full,
    marginTop: spacing.xs,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: '100%',
    borderRadius: radii.full,
  },
  recommendedMarker: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 14,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    marginLeft: -THUMB_SIZE / 2,
    borderWidth: 2,
  },
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  caption: {
    fontSize: typography.fontSize.xs,
  },
  captionRecommended: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  estimateNote: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
});
