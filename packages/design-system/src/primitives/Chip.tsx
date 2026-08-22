import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing, radii, typography } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

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
  /** Optional `useAppTheme()` override (Stitch migration) — when given,
   *  `tone: 'default'` renders solid-accent instead of the legacy static
   *  mint tint. Unused (and defaulting to the legacy colors) anywhere this
   *  primitive hasn't been migrated yet. */
  theme?: AppPalette;
}

export function Chip({
  label,
  tone = 'default',
  icon,
  style,
  onPress,
  selected,
  theme,
}: ChipProps): React.JSX.Element {
  const isDefault = tone === 'default';
  const chipBackground = theme ? (isDefault ? theme.accent : theme.surfaceMuted) : undefined;
  const textColor = theme ? (isDefault ? theme.onAccent : theme.inkMuted) : undefined;

  const content = (
    <>
      {icon}
      <Text
        style={[
          styles.text,
          theme ? { color: textColor } : isDefault ? styles.textDefault : styles.textDim,
        ]}
      >
        {label}
      </Text>
    </>
  );

  const chipStyle = [
    styles.chip,
    theme ? { backgroundColor: chipBackground } : isDefault ? styles.chipDefault : styles.chipDim,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={chipStyle}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: selected ?? isDefault }}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={chipStyle} accessible accessibilityRole="text" accessibilityLabel={label}>
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
