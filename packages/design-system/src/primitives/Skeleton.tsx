import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, typography } from '../tokens/index';

const PULSE_DURATION_MS = 700;
const MIN_OPACITY = 0.45;
const MAX_OPACITY = 1;

/**
 * Shared pulse animation, core RN Animated (not Reanimated — no other
 * primitive in this package uses it yet, and pulling in a second animation
 * library for one shimmer effect isn't worth the added peer-dependency and
 * test-mock surface).
 */
function usePulse(): Animated.Value {
  const opacity = useRef(new Animated.Value(MIN_OPACITY)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: MAX_OPACITY,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: MIN_OPACITY,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return opacity;
}

interface SkeletonBlockProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: keyof typeof radii;
  style?: StyleProp<ViewStyle>;
}

/** A skeleton rectangle of arbitrary size — the base every other variant composes. */
export function SkeletonBlock({
  width = '100%',
  height = 16,
  radius = 'sm',
  style,
}: SkeletonBlockProps): React.JSX.Element {
  const opacity = usePulse();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        { width, height, borderRadius: radii[radius], opacity },
        style,
      ]}
    />
  );
}

interface SkeletonCircleProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** A skeleton circle — avatars, driver pins, round icons. */
export function SkeletonCircle({ size = 40, style }: SkeletonCircleProps): React.JSX.Element {
  return (
    <SkeletonBlock width={size} height={size} radius="full" style={style} />
  );
}

type SkeletonTextVariant = 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'label';

interface SkeletonTextProps {
  variant?: SkeletonTextVariant;
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
}

// A skeleton line reads better as a bar noticeably thinner than the text
// variant's full line-height, not the same height as the glyphs it stands in for.
const TEXT_HEIGHT: Record<SkeletonTextVariant, number> = {
  h1: typography.fontSize['4xl'] * 0.6,
  h2: typography.fontSize['3xl'] * 0.6,
  h3: typography.fontSize['2xl'] * 0.6,
  body: typography.fontSize.md * 0.6,
  bodySmall: typography.fontSize.sm * 0.6,
  caption: typography.fontSize.xs * 0.6,
  label: typography.fontSize.sm * 0.6,
};

/** A skeleton line matching a given Text variant's approximate weight. */
export function SkeletonText({
  variant = 'body',
  width = '100%',
  style,
}: SkeletonTextProps): React.JSX.Element {
  return (
    <SkeletonBlock width={width} height={TEXT_HEIGHT[variant]} radius="sm" style={style} />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.gray200,
  },
});
