import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { spacing, radii, typography } from '../tokens/index';
import { haptics } from '../utils/haptics';
import type { AppPalette } from '../theme/palette';
import { useAppTheme } from '../theme/AppThemeProvider';

interface ChipProps {
  label: string;
  /** Static (non-pressable) chips: 'default' is an accent-tinted tag,
   *  'dim' a neutral one. */
  tone?: 'default' | 'dim';
  icon?: React.ReactNode;
  style?: ViewStyle;
  /** Makes the chip a toggle/filter control. */
  onPress?: () => void;
  /** Toggle state for a pressable chip — exactly one chip in a filter row
   *  is selected. */
  selected?: boolean;
  /** Overrides the theme from context — only for a screen pinned to one palette. */
  theme?: AppPalette;
}

/**
 * Pressable chip = filter/toggle: selected is the palette's deliberate
 * "black moment" (`ink`, per palette.ts), unselected a quiet outlined
 * sibling. Both states carry a 1px border (transparent when filled) so
 * switching never shifts metrics. Static chips are small tinted tags.
 */
function chipColors(theme: AppPalette, pressable: boolean, selected: boolean, tone: 'default' | 'dim'): { chip: ViewStyle; text: string } {
  if (pressable) {
    return selected
      ? { chip: { backgroundColor: theme.ink, borderWidth: 1, borderColor: 'transparent' }, text: theme.onInk }
      : { chip: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.outlineVariant }, text: theme.inkMuted };
  }
  return tone === 'default'
    ? { chip: { backgroundColor: theme.accentGlow + '55' }, text: theme.accentStrong }
    : { chip: { backgroundColor: theme.surfaceMuted }, text: theme.inkMuted };
}

export function Chip({
  label,
  tone = 'default',
  icon,
  style,
  onPress,
  selected,
  theme: themeOverride,
}: ChipProps): React.JSX.Element {
  const { colors: contextTheme } = useAppTheme();
  const theme = themeOverride ?? contextTheme;
  // `selected ?? tone === 'default'` keeps callers that toggle via `tone` working.
  const isSelected = selected ?? tone === 'default';
  const colors = chipColors(theme, Boolean(onPress), isSelected, tone);

  const content = (
    <>
      {icon}
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </>
  );

  const chipStyle = [styles.chip, colors.chip, style];

  if (onPress) {
    function handlePress(): void {
      haptics.selection();
      onPress?.();
    }

    return (
      <TouchableOpacity
        onPress={handlePress}
        style={chipStyle}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isSelected }}
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
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
