import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { radii, spacing } from '../tokens/index';
import { Text } from './Text';
import { Icon } from './Icon';
import { BottomSheet } from './BottomSheet';
import { useAppTheme } from '../theme/AppThemeProvider';

export interface PassengerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Currently committed passenger count. */
  value: number;
  /** Called with the adjusted count once the user confirms. */
  onChange: (count: number) => void;
  min?: number;
  max?: number;
  /** Sheet header — defaults to 'Passagers'. A driver publishing a ride
   *  counts seats, not passengers, so Publish overrides this to 'Places
   *  disponibles' rather than reusing rider copy on a driver screen. */
  title?: string;
  /** Live count label under the stepper — defaults to French passenger
   *  pluralization. */
  formatCount?: (count: number) => string;
  /** Bound hint under the count — defaults to a passenger-count cap note. */
  hint?: string;
}

/** Shared bound with searchSlice's clamp — kept here so the stepper's
 *  disabled states can never disagree with what the slice would accept. */
export const PASSENGER_MIN = 1;
export const PASSENGER_MAX = 8;

export function clampPassengerCount(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Pure so tests can pin the French pluralization without RN. */
export function formatPassengerCount(count: number): string {
  return `${count} passager${count > 1 ? 's' : ''}`;
}

/**
 * Passenger-count picker presented in the same sheet grammar as
 * DateCalendarSheet/TimeWheelSheet: edits land in a local draft,
 * "Confirmer" commits them, and dragging the sheet away discards.
 */
export function PassengerSheet({
  visible,
  onClose,
  value,
  onChange,
  min = PASSENGER_MIN,
  max = PASSENGER_MAX,
  title = 'Passagers',
  formatCount = formatPassengerCount,
  hint,
}: PassengerSheetProps): React.JSX.Element | null {
  // useAppTheme() hands back { colors, scheme } — the palette lives under
  // .colors (same destructure every other themed primitive uses).
  const { colors: theme } = useAppTheme();
  const [draft, setDraft] = useState(value);

  // Re-sync the draft every time the sheet opens so a previously discarded
  // editing session can never leak into the next one.
  useEffect(() => {
    if (visible) setDraft(clampPassengerCount(value, min, max));
  }, [visible, value, min, max]);

  const canDecrement = draft > min;
  const canIncrement = draft < max;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightRatio={0.42}
      theme={theme}
      headerContent={
        <View style={styles.headerRow}>
          <View style={styles.headerSpacer} />
          {/* Same h3 header grammar as DateCalendarSheet/TimeWheelSheet —
           *  every sheet title in the system is h3, never a smaller label. */}
          <Text variant="h3" style={[styles.headerTitle, { color: theme.ink }]}>
            {title}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="close" size="sm" color={theme.ink} />
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.body}>
        <View
          style={styles.stepperRow}
          accessible
          accessibilityRole="adjustable"
          accessibilityActions={[
            { name: 'increment', label: 'Ajouter un passager' },
            { name: 'decrement', label: 'Retirer un passager' },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment' && canIncrement) {
              setDraft((d) => d + 1);
            } else if (event.nativeEvent.actionName === 'decrement' && canDecrement) {
              setDraft((d) => d - 1);
            }
          }}
        >
          <TouchableOpacity
            testID="passenger-decrement"
            onPress={() => setDraft((d) => d - 1)}
            disabled={!canDecrement}
            style={[
              styles.stepButton,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant },
              !canDecrement && styles.stepButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Retirer un passager"
            accessibilityState={{ disabled: !canDecrement }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon
              name="remove"
              size="md"
              color={canDecrement ? theme.ink : theme.inkFaint}
              accessibilityLabel="Retirer un passager"
            />
          </TouchableOpacity>

          <Text
            variant="headlineDisplay"
            style={[styles.count, { color: theme.ink }]}
            accessibilityLabel={formatPassengerCount(draft)}
            accessibilityLiveRegion="polite"
          >
            {draft}
          </Text>

          <TouchableOpacity
            testID="passenger-increment"
            onPress={() => setDraft((d) => d + 1)}
            disabled={!canIncrement}
            style={[
              styles.stepButton,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant },
              !canIncrement && styles.stepButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un passager"
            accessibilityState={{ disabled: !canIncrement }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon
              name="add"
              size="md"
              color={canIncrement ? theme.ink : theme.inkFaint}
              accessibilityLabel="Ajouter un passager"
            />
          </TouchableOpacity>
        </View>

        <Text variant="bodySmall" style={[styles.caption, { color: theme.inkMuted }]}>
          {formatCount(draft)}
        </Text>
        <Text variant="caption" style={[styles.hint, { color: theme.inkFaint }]}>
          {hint ?? `Jusqu'à ${max} passagers par trajet`}
        </Text>
      </View>

      <TouchableOpacity
        testID="passenger-confirm"
        onPress={() => {
          onChange(clampPassengerCount(draft, min, max));
          onClose();
        }}
        style={[styles.confirmButton, { backgroundColor: theme.ink }]}
        accessibilityRole="button"
        accessibilityLabel={`Confirmer ${formatCount(draft)}`}
        activeOpacity={0.85}
      >
        <Text variant="bodySmall" style={[styles.confirmLabel, { color: theme.background }]}>
          Confirmer
        </Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSpacer: {
    width: spacing['3xl'],
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  body: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3xl'],
  },
  stepButton: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: {
    opacity: 0.4,
  },
  count: {
    minWidth: 64,
    textAlign: 'center',
  },
  caption: {
    marginTop: spacing.lg,
  },
  hint: {
    marginTop: spacing.xs,
  },
  confirmButton: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg - 2,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  confirmLabel: {
    fontWeight: '600',
  },
});
