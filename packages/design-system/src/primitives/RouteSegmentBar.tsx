import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import type { AppPalette } from '../theme/palette';

interface RouteSegmentBarProps {
  /** The whole ride's own start and end (the driver's trip). */
  startLabel: string;
  endLabel: string;
  /** 0..1 positions of the highlighted part (a passenger's leg) along it. */
  segmentStart: number;
  segmentEnd: number;
  accessibilityLabel: string;
  theme?: AppPalette;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The driver's whole ride as one line, with the part a passenger would ride
 * highlighted — read at a glance: "she joins a third of the way in and rides
 * to the end". Positions come from the server (the passenger's pickup and
 * drop-off projected on the real route); this only draws them.
 */
export function RouteSegmentBar({
  startLabel,
  endLabel,
  segmentStart,
  segmentEnd,
  accessibilityLabel,
  theme: themeOverride,
}: RouteSegmentBarProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;
  const start = clamp01(Math.min(segmentStart, segmentEnd));
  const end = clamp01(Math.max(segmentStart, segmentEnd));
  // A leg too short to see still reads as a leg.
  const width = Math.max(end - start, 0.04);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={styles.wrap}>
      <View style={styles.track}>
        <View style={[styles.rail, { backgroundColor: theme.outlineVariant }]} />
        <View style={[styles.endDot, styles.endDotStart, { borderColor: theme.inkFaint, backgroundColor: theme.surface }]} />
        <View style={[styles.endDot, styles.endDotEnd, { borderColor: theme.inkFaint, backgroundColor: theme.surface }]} />
        <View
          testID="route-segment"
          style={[
            styles.segment,
            { left: `${start * 100}%`, width: `${width * 100}%`, backgroundColor: theme.accent },
          ]}
        />
        <View style={[styles.segmentDot, { left: `${start * 100}%`, borderColor: theme.accent, backgroundColor: theme.surface }]} />
        <View
          style={[
            styles.segmentDot,
            { left: `${Math.min(start + width, 1) * 100}%`, borderColor: theme.accent, backgroundColor: theme.accent },
          ]}
        />
      </View>
      <View style={styles.labels}>
        <Text variant="caption" color={theme.inkFaint} numberOfLines={1} style={styles.labelStart}>
          {startLabel}
        </Text>
        <Text variant="caption" color={theme.inkFaint} numberOfLines={1} style={styles.labelEnd}>
          {endLabel}
        </Text>
      </View>
    </View>
  );
}

const TRACK_HEIGHT = 14;
const DOT = 12;

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  track: {
    height: TRACK_HEIGHT,
    justifyContent: 'center',
    marginHorizontal: DOT / 2,
  },
  rail: {
    height: 2,
    borderRadius: radii.full,
  },
  endDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  endDotStart: {
    left: -4,
  },
  endDotEnd: {
    right: -4,
  },
  segment: {
    position: 'absolute',
    height: 6,
    borderRadius: radii.full,
  },
  segmentDot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 3,
    marginLeft: -DOT / 2,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  labelStart: {
    flexShrink: 1,
  },
  labelEnd: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
