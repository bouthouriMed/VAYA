import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../tokens/index';

interface MapPreviewProps {
  height?: number;
  badge?: string;
  style?: ViewStyle;
  children?: React.ReactNode;
}

/**
 * Stylized map placeholder (no live tiles yet — Phase 9 wires react-native-maps).
 * Draws an angled route line between a start and end marker to suggest a corridor.
 */
export function MapPreview({
  height = 160,
  badge,
  style,
  children,
}: MapPreviewProps): React.JSX.Element {
  return (
    <View style={[styles.wrap, { height }, style]}>
      <View
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.routeLine} />
        <View style={[styles.marker, styles.markerStart]} />
        <View style={[styles.marker, styles.markerEnd]} />
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.mapTileTint,
    borderRadius: radii.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  routeLine: {
    position: 'absolute',
    left: '20%',
    top: '65%',
    width: '65%',
    height: 3,
    backgroundColor: colors.mapRouteLine,
    borderRadius: 2,
    transform: [{ rotate: '-28deg' }],
  },
  marker: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.white,
  },
  markerStart: {
    left: '18%',
    top: '68%',
    backgroundColor: colors.mapUserMarker,
  },
  markerEnd: {
    right: '18%',
    top: '22%',
    backgroundColor: colors.mapDriverMarker,
  },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.navySurface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  badgeText: {
    color: colors.navyText,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
});
