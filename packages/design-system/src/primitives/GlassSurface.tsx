import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { radii } from '../tokens/index';
import type { AppPalette, ColorScheme } from '../theme/palette';
import { useAppTheme } from '../theme/AppThemeProvider';

interface GlassSurfaceProps {
  children: React.ReactNode;
  radius?: keyof typeof radii;
  /** iOS blur intensity (0-100); Android has no real backdrop blur, so it
   *  falls back to a solid tinted surface at a matching opacity. */
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  /** Overrides the theme from context — only for a screen pinned to one
   *  palette (e.g. the always-dark sign-in hero). Pass `scheme` with it. */
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
 * unmount/remount across a screen transition and paint a stale blurred
 * frame on top of whatever renders next. Android always falls back to the
 * tinted-translucent `View` below instead.
 */
export function GlassSurface({
  children,
  radius = '2xl',
  intensity = 50,
  style,
  theme: themeOverride,
  scheme: schemeOverride,
}: GlassSurfaceProps): React.JSX.Element {
  const context = useAppTheme();
  const theme = themeOverride ?? context.colors;
  const isDark = (schemeOverride ?? context.scheme) === 'dark';

  return (
    <View style={[styles.clip, { borderRadius: radii[radius] }, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={intensity} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface + '8C' }]} />
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
