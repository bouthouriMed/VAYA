import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import { useReducedMotion } from '../utils/useReducedMotion';
import type { AppPalette } from '../theme/palette';

interface RatingBreakdownProps {
  /** Average stars, 0..5 — already formatted for display in `averageLabel`. */
  average: number;
  /** "4,8" — formatted by the caller in the viewer's locale. */
  averageLabel: string;
  /** "12 avis". */
  countLabel: string;
  /** Ratings per star value, index 0 = 1★ … index 4 = 5★. */
  starCounts: readonly [number, number, number, number, number];
  accessibilityLabel: string;
  theme?: AppPalette;
}

/** Whole, half or empty star for position `index` (0-based) of `average`. */
export function starShape(average: number, index: number): 'star' | 'star-half' | 'star-outline' {
  const remainder = average - index;
  if (remainder >= 0.75) return 'star';
  if (remainder >= 0.25) return 'star-half';
  return 'star-outline';
}

/**
 * The average as one big number with its stars, next to how the ratings
 * actually spread from 5★ down to 1★ — counts only, never comment text.
 * The bars grow in once on mount (skipped under Reduce Motion).
 */
export function RatingBreakdown({
  average,
  averageLabel,
  countLabel,
  starCounts,
  accessibilityLabel,
  theme: themeOverride,
}: RatingBreakdownProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const max = Math.max(1, ...starCounts);

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 700,
      delay: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, reduceMotion]);

  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={accessibilityLabel} style={styles.row}>
      <View style={styles.summary}>
        <Text variant="displaySmall" color={theme.ink}>
          {averageLabel}
        </Text>
        <View style={styles.stars}>
          {[0, 1, 2, 3, 4].map((index) => (
            <Icon key={index} name={starShape(average, index)} size="xs" color={theme.accent} />
          ))}
        </View>
        <Text variant="caption" color={theme.inkFaint}>
          {countLabel}
        </Text>
      </View>

      <View style={styles.bars}>
        {[4, 3, 2, 1, 0].map((index) => {
          const share = starCounts[index]! / max;
          return (
            <View key={index} style={styles.barRow}>
              <Text variant="caption" color={theme.inkMuted} style={styles.barLabel}>
                {String(index + 1)}
              </Text>
              <View style={[styles.track, { backgroundColor: theme.surfaceMuted }]}>
                <Animated.View
                  testID={`rating-bar-${index + 1}`}
                  style={[
                    styles.fill,
                    {
                      backgroundColor: index >= 3 ? theme.accent : theme.inkFaint,
                      width: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', `${Math.round(share * 100)}%`],
                      }),
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  summary: {
    alignItems: 'center',
    gap: 2,
    minWidth: 88,
  },
  stars: {
    flexDirection: 'row',
    gap: 1,
  },
  bars: {
    flex: 1,
    gap: 6,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barLabel: {
    width: 10,
    textAlign: 'center',
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.full,
  },
});
