import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from './Text';
import { useAppTheme } from '../theme/AppThemeProvider';
import type { AppPalette } from '../theme/palette';

interface CountdownRingProps {
  /** Share of the time window still left, 0..1. */
  remaining: number;
  /** The big number in the middle ("12"). */
  value: string;
  /** Its unit underneath ("min"). */
  unit?: string;
  size?: number;
  accessibilityLabel: string;
  theme?: AppPalette;
}

/**
 * Time left to answer, as a ring that empties — calm while there's time,
 * warm amber in the last quarter, never an alarm red (VAYA's palette has no
 * saturated "alert" colors by design).
 */
export function CountdownRing({
  remaining,
  value,
  unit,
  size = 48,
  accessibilityLabel,
  theme: themeOverride,
}: CountdownRingProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;
  const share = Math.max(0, Math.min(1, remaining));
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = share <= 0.25 ? theme.warning : theme.accent;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
      style={[styles.wrap, { width: size, height: size }]}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.outlineVariant} strokeWidth={stroke} fill="none" />
        <Circle
          testID="countdown-arc"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - share)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text variant="label" color={theme.ink} style={styles.value}>
        {value}
      </Text>
      {unit ? (
        <Text variant="caption" color={theme.inkFaint} style={styles.unit}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    lineHeight: 16,
  },
  unit: {
    fontSize: 10,
    lineHeight: 12,
  },
});
