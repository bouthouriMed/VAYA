import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import type { IconName } from './Icon';
import { spacing, radii, elevation } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import { useReducedMotion } from '../utils/useReducedMotion';
import type { AppPalette } from '../theme/palette';

export type SpotlightTone = 'accent' | 'warning' | 'info' | 'error' | 'neutral';

interface SpotlightAction {
  label: string;
  onPress: () => void;
  icon?: IconName;
}

interface SpotlightCardProps {
  /** Shown full-bleed on top (a map preview). */
  media?: React.ReactNode;
  /** One short line above the title: the moment ("Départ dans 2 h 05"). */
  eyebrow: string;
  eyebrowTone?: SpotlightTone;
  /** Pulses the eyebrow's dot — only while something is really live. */
  live?: boolean;
  title: string;
  subtitle?: string;
  /** Meeting point, the other person, facts. */
  children?: React.ReactNode;
  primaryAction?: SpotlightAction;
  secondaryAction?: SpotlightAction;
  onPress?: () => void;
  accessibilityLabel: string;
  theme?: AppPalette;
}

function toneColor(tone: SpotlightTone, theme: AppPalette): { fg: string; halo: string } {
  switch (tone) {
    case 'accent':
      return { fg: theme.accentStrong, halo: theme.accentGlow };
    case 'warning':
      return { fg: theme.warning, halo: theme.warningMuted };
    case 'error':
      return { fg: theme.error, halo: theme.errorMuted };
    case 'info':
      return { fg: theme.info, halo: theme.surfaceMuted };
    default:
      return { fg: theme.inkMuted, halo: theme.surfaceMuted };
  }
}

function LiveDot({ color, halo, live }: { color: string; halo: string; live: boolean }): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!live || reduceMotion) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [live, reduceMotion, pulse]);

  return (
    <View style={styles.dotWrap}>
      {live ? (
        <Animated.View
          style={[
            styles.dotHalo,
            {
              backgroundColor: halo,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
            },
          ]}
        />
      ) : null}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

/**
 * The one card on top of a list: the thing that matters right now. Its
 * eyebrow says the moment, the title says what, the body carries only what
 * the person needs for that moment, and one action takes them there.
 */
export function SpotlightCard({
  media,
  eyebrow,
  eyebrowTone = 'accent',
  live = false,
  title,
  subtitle,
  children,
  primaryAction,
  secondaryAction,
  onPress,
  accessibilityLabel,
  theme: themeOverride,
}: SpotlightCardProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;
  const tone = toneColor(eyebrowTone, theme);

  return (
    <View
      style={[styles.card, elevation.sm, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
      testID="spotlight-card"
    >
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.85}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
      >
        {media ? <View style={styles.media}>{media}</View> : null}
        <View style={styles.head}>
          <View style={styles.eyebrowRow}>
            <LiveDot color={tone.fg} halo={tone.halo} live={live} />
            <Text variant="caption" color={tone.fg} style={styles.eyebrow} numberOfLines={1}>
              {eyebrow}
            </Text>
          </View>
          <Text variant="headlineDisplay" color={theme.ink} style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="bodySmall" color={theme.inkMuted}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      {children || primaryAction || secondaryAction ? (
        <View style={styles.body}>
          {children}
          {primaryAction || secondaryAction ? (
            <View style={styles.actions}>
              {secondaryAction ? (
                <Button
                  variant="secondary"
                  label={secondaryAction.label}
                  icon={secondaryAction.icon}
                  onPress={secondaryAction.onPress}
                  style={styles.action}
                  theme={theme}
                />
              ) : null}
              {primaryAction ? (
                <Button
                  label={primaryAction.label}
                  icon={primaryAction.icon}
                  onPress={primaryAction.onPress}
                  style={styles.action}
                  theme={theme}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii['2xl'],
    borderWidth: 1,
    overflow: 'hidden',
  },
  media: {
    overflow: 'hidden',
  },
  head: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: 4,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  dotWrap: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotHalo: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  title: {
    fontSize: 22,
    lineHeight: 22 * 1.2,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
