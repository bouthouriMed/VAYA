import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import { colors, typography } from '../tokens/index';

type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: AvatarSize;
  /** Overrides the size preset with an exact pixel diameter (e.g. for map-zoom scaling). */
  sizePx?: number;
  style?: StyleProp<ImageStyle>;
  /**
   * Themed fallback override (Stitch migration). When given, the initials
   * fallback uses these instead of the legacy hashed warm-token palette —
   * for screens already on `useAppTheme()`. Omit to keep prior behavior.
   */
  fallbackBackgroundColor?: string;
  fallbackTextColor?: string;
}

const sizeMap: Record<AvatarSize, number> = {
  sm: 32,
  md: 44,
  lg: 64,
};

const fontSizeMap: Record<AvatarSize, number> = {
  sm: typography.fontSize.sm,
  md: typography.fontSize.md,
  lg: typography.fontSize.xl,
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function stringToColor(str: string): string {
  const colorOptions = [
    colors.primary,
    colors.secondary,
    colors.success,
    colors.info,
    colors.warning,
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colorOptions[Math.abs(hash) % colorOptions.length]!;
}

export function Avatar({
  uri,
  name = '',
  size = 'md',
  sizePx,
  style,
  fallbackBackgroundColor,
  fallbackTextColor,
}: AvatarProps): React.JSX.Element {
  const dimension = sizePx ?? sizeMap[size];
  const fontSize = sizePx ? Math.round(sizePx * 0.4) : fontSizeMap[size];
  // A broken/unreachable avatarUrl (dead link, offline device) must not
  // render as a blank box — Image has no built-in fallback, so a failed
  // load drops straight through to the same initials treatment as a
  // missing uri.
  const [failedToLoad, setFailedToLoad] = useState(false);

  if (uri && !failedToLoad) {
    return (
      <Image
        source={{ uri }}
        accessibilityRole="image"
        accessibilityLabel={name ? `Photo de ${name}` : undefined}
        onError={() => setFailedToLoad(true)}
        style={[
          {
            width: dimension,
            height: dimension,
            borderRadius: dimension / 2,
          },
          style,
        ]}
      />
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name ? `Photo de ${name}` : undefined}
      style={[
        styles.fallback,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: fallbackBackgroundColor ?? stringToColor(name),
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize, color: fallbackTextColor }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.white,
    fontWeight: typography.fontWeight.semibold,
  },
});
