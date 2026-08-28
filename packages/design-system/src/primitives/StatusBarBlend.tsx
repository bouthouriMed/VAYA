import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppPalette, ColorScheme } from '../theme/palette';

interface StatusBarBlendProps {
  /** Total blend height — callers pass `insets.top` plus breathing room so
   *  the strongest frost always covers exactly the OS icon zone. */
  height: number;
  theme: AppPalette;
  scheme: ColorScheme;
  style?: StyleProp<ViewStyle>;
}

/**
 * The frosted blend between a full-bleed map (or any edge-to-edge media)
 * and the OS status bar — the clock/battery/signal icons sit on a soft
 * progressive frost that melts into crisp content below instead of a flat
 * scrim band.
 *
 * Two layers cooperate:
 *  1. Five stacked `BlurView` strips whose intensity ramps toward the top
 *     (the classic RN progressive-blur technique). A single flat BlurView
 *     would draw a hard glass edge mid-map; the ramp is what removes it.
 *     Band boundaries are pixel-snapped so adjacent strips tile with no
 *     hairline gaps on any screen density.
 *  2. A faint wash of the theme's own background color over the top third,
 *     guaranteeing status-icon contrast on any map tile color in both
 *     schemes without ever reading as a tinted band (near-white wash +
 *     light frost in light mode; near-black wash + dark frost in dark).
 *
 * iOS gets the real progressive backdrop blur described above. Android
 * used to get it too via `experimentalBlurMethod="dimezisBlurView"` (same
 * tradeoff as GlassSurface) but that's dropped now — its screenshot-based
 * native surface can survive this component's unmount/remount across a
 * screen transition and paint a stale blurred band across the top of
 * whatever renders next. Android always falls back to the wash-only
 * treatment (the `LinearGradient` below, with no blur strips) instead,
 * which still reads as a soft blend, just without the blur itself.
 *
 * Purely decorative — pointer-transparent and hidden from accessibility.
 */
export function StatusBarBlend({
  height,
  theme,
  scheme,
  style,
}: StatusBarBlendProps): React.JSX.Element | null {
  if (height <= 0) return null;

  const tint = scheme === 'dark' ? 'dark' : 'light';
  // Pixel-snapped cumulative tops; each strip's height is the gap to the
  // next boundary, so rounding can never leave a seam between neighbors.
  const tops = BAND_FRACTIONS.map((f) => Math.round(f * height));

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
      style={[styles.container, { height }, style]}
    >
      {Platform.OS === 'ios'
        ? BAND_INTENSITIES.map((intensity, i) => (
            <BlurView
              key={i}
              intensity={intensity}
              tint={tint}
              style={[
                StyleSheet.absoluteFill,
                { top: tops[i], bottom: height - (tops[i + 1] ?? height) },
              ]}
            />
          ))
        : null}
      <LinearGradient
        colors={[`${theme.background}D9`, `${theme.background}4D`, `${theme.background}00`]}
        locations={[0, 0.38, 1]}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}

/** Cumulative band boundaries as fractions of `height`, bottom → top. */
const BAND_FRACTIONS = [0, 0.3, 0.52, 0.7, 0.85, 1] as const;
/** expo-blur intensity per band, bottom → top — small steps keep the ramp
 *  free of visible banding on detailed map tiles. */
const BAND_INTENSITIES = [14, 28, 44, 60, 78] as const;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    overflow: 'hidden',
  },
});
