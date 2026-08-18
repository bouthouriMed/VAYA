import React from 'react';
import { View, Text, Image, StyleSheet, type ImageStyle } from 'react-native';
import { colors, typography } from '../tokens/index.js';

type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: AvatarSize;
  style?: ImageStyle;
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

export function Avatar({ uri, name = '', size = 'md', style }: AvatarProps): React.JSX.Element {
  const dimension = sizeMap[size];

  if (uri) {
    return (
      <Image
        source={{ uri }}
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
      style={[
        styles.fallback,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: stringToColor(name),
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: fontSizeMap[size] }]}>{getInitials(name)}</Text>
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
