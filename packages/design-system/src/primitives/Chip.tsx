import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing, radii, typography } from '../tokens/index';

interface ChipProps {
  label: string;
  tone?: 'default' | 'dim';
  icon?: React.ReactNode;
  style?: ViewStyle;
  /**
   * Phase 9 (docs/roadmap/phase-09-ratings-trust.md): makes the chip
   * tappable (e.g. a toggle-able tag on the rating-submission sheet)
   * without every screen that needs a tappable chip having to wrap it in
   * its own raw TouchableOpacity — the exact pattern the old
   * bookings/settlement.tsx improvised locally, which this generalizes
   * into the primitive instead (CLAUDE.md's design-system rule).
   */
  onPress?: () => void;
  /** Only meaningful together with `onPress` — announced as a toggle state. */
  selected?: boolean;
}

export function Chip({
  label,
  tone = 'default',
  icon,
  style,
  onPress,
  selected,
}: ChipProps): React.JSX.Element {
  const content = (
    <>
      {icon}
      <Text style={[styles.text, tone === 'dim' ? styles.textDim : styles.textDefault]}>
        {label}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={[styles.chip, tone === 'dim' ? styles.chipDim : styles.chipDefault, style]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: selected ?? tone === 'default' }}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[styles.chip, tone === 'dim' ? styles.chipDim : styles.chipDefault, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
  },
  chipDefault: {
    backgroundColor: colors.secondaryLight + '3D',
  },
  chipDim: {
    backgroundColor: colors.gray200,
  },
  text: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  textDefault: {
    color: colors.secondaryDark,
  },
  textDim: {
    color: colors.gray600,
  },
});
