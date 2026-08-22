import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  AccessibilityInfo,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, spacing, radii } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

interface StepProgressProps {
  /** 1-indexed. */
  currentStep: number;
  totalSteps: number;
  /** Optional `useAppTheme()` colors — defaults to the legacy static
   *  tokens anywhere the consumer hasn't been migrated yet. */
  theme?: AppPalette;
  style?: StyleProp<ViewStyle>;
}

/**
 * Segmented stepper — completed segments sit solid, the current one sweeps
 * its fill in with an eased wipe on mount (skipped under reduce motion),
 * upcoming ones stay as faint tracks.
 */
export function StepProgress({
  currentStep,
  totalSteps,
  theme,
  style,
}: StepProgressProps): React.JSX.Element {
  const [reduceMotion, setReduceMotion] = useState(false);
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      fill.setValue(1);
      return;
    }
    // Re-sweep from empty whenever the current segment advances so a
    // long-lived instance still gets the wipe between steps.
    fill.setValue(0);
    Animated.timing(fill, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, reduceMotion]);

  const track = { backgroundColor: theme?.outlineVariant ?? colors.gray200 };
  const fillColor = { backgroundColor: theme?.accent ?? colors.secondary };

  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Étape ${currentStep} sur ${totalSteps}`}
      accessibilityValue={{ min: 1, max: totalSteps, now: currentStep }}
    >
      {Array.from({ length: totalSteps }).map((_, i) => {
        if (i < currentStep - 1) {
          return <View key={i} style={[styles.segment, styles.track, track, fillColor]} />;
        }
        if (i > currentStep - 1) {
          return <View key={i} style={[styles.segment, styles.track, track]} />;
        }
        return (
          <View key={i} style={[styles.segment, styles.track, track]}>
            <Animated.View style={[styles.fill, fillColor, { width: pct(fill) }]} />
          </View>
        );
      })}
    </View>
  );
}

const pct = (value: Animated.Value) =>
  value.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  segment: {
    flex: 1,
    height: 4,
  },
  track: {
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.full,
  },
});
