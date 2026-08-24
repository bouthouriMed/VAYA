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
  /** Only meaningful together with `onPress` — announced as a toggle state,
   *  and — on themed chips — actually rendered: selected = one solid-accent
   *  pill, unselected = quiet outlined sibling. Before this, `selected`
   *  was visually inert (it only ever reached accessibilityState), so a
   *  themed filter row like messages.tsx's Tous/À venir/En cours/Passés
   *  rendered every option solid green at once. */
  selected?: boolean;
  /** Optional `useAppTheme()` override (Stitch migration) — when given,
   *  tones follow the live theme instead of the legacy static colors.
   *  Unused (and defaulting to the legacy look) anywhere this primitive
   *  hasn't been migrated yet. */
  theme?: AppPalette;
}

/** A themed pressable chip is a real toggle/filter control: exactly one
 *  option in the row should carry weight. Selected = solid jewel accent
 *  (the brand's single loudest fill); unselected = the app's established
 *  "quiet button" idiom — surface fill + hairline outlineVariant border +
 *  muted ink, matching explore.tsx's paramBtn grid. Both states carry a
 *  1px border (transparent when filled) so switching never shifts metrics. */
function themedSelectableChip(
  theme: AppPalette,
  isSelected: boolean,
): { chip: ViewStyle; color: string } {
  return isSelected
    ? {
        chip: { backgroundColor: theme.accent, borderWidth: 1, borderColor: 'transparent' },
        color: theme.onAccent,
      }
    : {
        chip: {
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.outlineVariant,
        },
        color: theme.inkMuted,
      };
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
  // Themed + pressable → selection-driven rendering; `selected ?? isDefault`
  // keeps callers that predate the prop (tone-flipping instead) working.
  const selectable =
    theme && onPress ? themedSelectableChip(theme, selected ?? isDefault) : null;

  const textColor = selectable
    ? selectable.color
    : theme
      ? isDefault
        ? theme.onAccent
        : theme.inkMuted
      : undefined;

  const content = (
    <>
      {icon}
      <Text
        style={[
          styles.text,
          selectable || theme ? { color: textColor } : isDefault ? styles.textDefault : styles.textDim,
        ]}
      >
        {label}
      </Text>
    </>
  );

  const chipStyle = [
    styles.chip,
    selectable
      ? selectable.chip
      : theme
        ? { backgroundColor: isDefault ? theme.accent : theme.surfaceMuted }
        : isDefault
          ? styles.chipDefault
          : styles.chipDim,
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
