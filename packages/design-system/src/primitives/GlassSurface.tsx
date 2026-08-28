import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radii } from '../tokens/index';
import type { AppPalette, ColorScheme } from '../theme/palette';

type GlassTone = 'cream' | 'navy';

interface GlassSurfaceProps {
  children: React.ReactNode;
  tone?: GlassTone;
  radius?: keyof typeof radii;
  /** iOS blur intensity (0-100); Android has no real backdrop blur, so it
   *  falls back to a solid tinted surface at a matching opacity instead of
   *  a flat/transparent one — see the `tone` background below. */
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  /** Optional `useAppTheme()` override (Stitch migration) — when given
   *  (with `scheme`), the tint/blur follow the live theme instead of the
   *  legacy static `tone` prop. Unused (and defaulting to `tone`) anywhere
   *  this primitive hasn't been migrated yet. */
  theme?: AppPalette;
  scheme?: ColorScheme;
}

/**
 * The floating frosted surface behind every map-first composition in the
 * search flow (the collapsed prompt, the composer, a selected-driver panel)
 * — real content sits on the real map, this is what keeps it legible
 * without boxing it into an opaque card. `expo-blur`'s BlurView is
 * iOS-native (CAGaussianBlur), used there via `intensity`/`tint`. Android
 * has no equivalent compositor effect; `experimentalBlurMethod="dimezisBlurView"`
 * (a screenshot-based fake blur, the only Android option expo-blur offers)
 * was tried there but dropped — its native surface can survive a card's
 * unmount/remount across a screen transition (e.g. publishing a ride, or
 * navigating back, which is exactly when this wizard's cards unmount) and
 * paint a stale blurred frame on top of whatever renders next, sometimes
 * obscuring real content underneath it. Android always falls back to the
 * tinted-translucent `View` below instead — a flat frosted tint rather than
 * a true blur, but one that can't get stuck.
 */
export function GlassSurface({
  children,
  tone = 'cream',
  radius = '2xl',
  intensity = 50,
  style,
  theme,
  scheme,
}: GlassSurfaceProps): React.JSX.Element {
  const isDark = theme ? scheme === 'dark' : tone === 'navy';
  const tintBackground = theme
    ? theme.surface + '8C'
    : tone === 'navy'
      ? colors.primary + '99'
      : colors.gray50 + '8C';

  return (
    <View style={[styles.clip, { borderRadius: radii[radius] }, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={intensity} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
      ) : null}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: tintBackground }]} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  content: {
    position: 'relative',
  },
});
