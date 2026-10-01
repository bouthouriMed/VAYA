import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import { typography } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';

type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: AvatarSize;
  /** Overrides the size preset with an exact pixel diameter (e.g. for map-zoom scaling). */
  sizePx?: number;
  style?: StyleProp<ImageStyle>;
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

export function Avatar({
  uri,
  name = '',
  size = 'md',
  sizePx,
  style,
}: AvatarProps): React.JSX.Element {
  // One initials treatment everywhere, from the theme — the same person must
  // never render in one color on one screen and another color elsewhere.
  const { colors: theme } = useAppTheme();
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
          backgroundColor: theme.surfaceMuted,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize, color: theme.ink }]}>
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
    fontWeight: typography.fontWeight.semibold,
  },
});
