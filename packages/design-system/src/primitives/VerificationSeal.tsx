import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import type { AppPalette } from '../theme/palette';

export interface VerificationCheck {
  icon: IconName;
  label: string;
}

interface VerificationSealProps {
  checks: VerificationCheck[];
  accessibilityLabel: string;
  theme?: AppPalette;
}

/**
 * What VAYA checked, as a row of linked seals (identity — licence —
 * vehicle) rather than a bulleted list: each check is a tinted circle with
 * its icon and a small tick, joined by one line, its short name underneath.
 * Only ever rendered for checks that actually passed — there is no
 * "pending" look on purpose.
 */
export function VerificationSeal({
  checks,
  accessibilityLabel,
  theme: themeOverride,
}: VerificationSealProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;
  const NODE = 48;

  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={accessibilityLabel} style={styles.row}>
      {checks.length > 1 ? (
        <View
          style={[
            styles.connector,
            {
              top: NODE / 2,
              left: `${50 / checks.length}%`,
              right: `${50 / checks.length}%`,
              backgroundColor: theme.accentGlow,
            },
          ]}
        />
      ) : null}
      {checks.map((check) => (
        <View key={check.label} style={styles.item}>
          <View
            style={[
              styles.node,
              { width: NODE, height: NODE, borderRadius: NODE / 2, backgroundColor: theme.surface, borderColor: theme.accentGlow },
            ]}
          >
            <Icon name={check.icon} size="sm" color={theme.accentStrong} />
            <View style={[styles.tick, { backgroundColor: theme.accent, borderColor: theme.surface }]}>
              <Icon name="checkmark" size="xs" color={theme.onAccent} />
            </View>
          </View>
          <Text variant="caption" color={theme.inkMuted} align="center" numberOfLines={2}>
            {check.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    height: 2,
    borderRadius: radii.full,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  node: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
