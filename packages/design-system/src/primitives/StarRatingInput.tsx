import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../tokens/index';
import { haptics } from '../utils/haptics';
import type { AppPalette } from '../theme/palette';

interface StarRatingInputProps {
  /** Current rating, 1-5. 0 renders all stars unfilled (no selection yet). */
  value: number;
  onChange: (stars: number) => void;
  /** Announced once for the whole control — defaults to a generic French label. */
  accessibilityLabel?: string;
  disabled?: boolean;
  /** Optional `useAppTheme()` override — when given, filled/empty stars
   *  follow the live accent/outline tokens instead of the legacy static
   *  ones, so the input doesn't glow sage-on-white inside a themed sheet. */
  theme?: AppPalette;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

/**
 * Phase 9 (docs/roadmap/phase-09-ratings-trust.md): a tappable 1-5 star
 * input. No equivalent existed in this package before this phase —
 * `ReviewCard` only ever *displays* a star count (read-only), and the
 * rating-submission flow this phase adds is the first place a star value
 * needs to be captured as input. Built here rather than improvised as
 * local screen styling, per CLAUDE.md's design-system rule ("if a screen
 * needs a pattern the system doesn't have, build the primitive here
 * first").
 *
 * Deliberately stateless/controlled (no internal hooks) — matches this
 * package's existing accessibility-test pattern of calling primitives as
 * plain functions (see accessibility.test.ts's doc comment).
 */
export function StarRatingInput({
  value,
  onChange,
  accessibilityLabel = 'Note',
  disabled = false,
  theme,
}: StarRatingInputProps): React.JSX.Element {
  const starColor = theme ? theme.outlineVariant : colors.gray300;
  const starFilledColor = theme ? theme.accent : colors.secondary;
  return (
    <View
      style={styles.row}
      accessible={false}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 1, max: 5, now: value || undefined }}
    >
      {STAR_VALUES.map((n) => {
        const filled = n <= value;
        return (
          <TouchableOpacity
            key={n}
            onPress={() => {
              haptics.selection();
              onChange(n);
            }}
            disabled={disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`}
            accessibilityState={{ selected: filled, disabled }}
          >
            <Text style={[styles.star, { color: filled ? starFilledColor : starColor }]}>★</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  star: {
    fontSize: 32,
    color: colors.gray300,
  },
});
