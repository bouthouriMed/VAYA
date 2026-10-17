import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import type { AppPalette } from '../theme/palette';

export interface Fact {
  /** Optional in the `lg` size, where a bare number reads cleaner. */
  icon?: IconName;
  value: string;
  caption: string;
  /** Draws the value in the accent color (the fact that matters most). */
  emphasis?: boolean;
}

interface FactRowProps {
  facts: Fact[];
  /** `lg`: headline numbers (a profile's rating/trips/tenure) — large value,
   *  the icon after it in the accent color, no tinted background. */
  size?: 'md' | 'lg';
  theme?: AppPalette;
}

/**
 * A few key numbers side by side, separated by hairlines — value on top,
 * what it is underneath ("+3 min / détour", "4,5 DT / pour vous").
 */
export function FactRow({ facts, size = 'md', theme: themeOverride }: FactRowProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;

  if (size === 'lg') {
    return (
      <View style={styles.rowLg}>
        {facts.map((fact, index) => (
          <View
            key={`${fact.caption}-${index}`}
            accessible
            accessibilityLabel={`${fact.value} ${fact.caption}`}
            style={[styles.cellLg, index > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.outline }]}
          >
            <View style={styles.valueRow}>
              <Text variant="h3" color={fact.emphasis ? theme.accentStrong : theme.ink} numberOfLines={1} adjustsFontSizeToFit>
                {fact.value}
              </Text>
              {fact.icon ? <Icon name={fact.icon} size="sm" color={theme.accent} /> : null}
            </View>
            <Text variant="caption" color={theme.inkFaint} numberOfLines={1}>
              {fact.caption}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.row, { backgroundColor: theme.surfaceMuted }]}>
      {facts.map((fact, index) => (
        <View
          key={`${fact.caption}-${index}`}
          accessible
          accessibilityLabel={`${fact.value} ${fact.caption}`}
          style={[styles.cell, index > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.outline }]}
        >
          <View style={styles.valueRow}>
            {fact.icon ? (
              <Icon name={fact.icon} size="xs" color={fact.emphasis ? theme.accentStrong : theme.inkMuted} />
            ) : null}
            <Text variant="label" color={fact.emphasis ? theme.accentStrong : theme.ink} numberOfLines={1}>
              {fact.value}
            </Text>
          </View>
          <Text variant="caption" color={theme.inkFaint} numberOfLines={1}>
            {fact.caption}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
  },
  rowLg: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  cellLg: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
