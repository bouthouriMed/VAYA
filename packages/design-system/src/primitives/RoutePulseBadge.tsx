import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../tokens/index';

export type RoutePulseBadgeSize = 'md' | 'hero';
export type RoutePulseBadgeTone = 'onCream' | 'onNavy';

interface RoutePulseBadgeProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  size?: RoutePulseBadgeSize;
  tone?: RoutePulseBadgeTone;
}

const DIMENSIONS: Record<RoutePulseBadgeSize, { box: number; core: number; icon: number }> = {
  md: { box: 64, core: 40, icon: 22 },
  hero: { box: 128, core: 80, icon: 40 },
};

/**
 * VAYA's driver-flow signature motif: concentric rings radiating from a
 * solid core, evoking a route ping on the map. Reused at two scales across
 * the whole driver-onboarding/ride-creation flow (the "Become a Driver"
 * hero and every subsequent step header) so the flow reads as one
 * deliberately-designed sequence rather than a series of unrelated forms.
 * Purely static/no animation — screens that want a live pulse wrap this in
 * their own Animated.View (keeps this primitive hook-free and safely
 * callable in the direct-invocation test pattern this package uses).
 */
export function RoutePulseBadge({
  icon,
  size = 'md',
  tone = 'onCream',
}: RoutePulseBadgeProps): React.JSX.Element {
  const { box, core, icon: iconSize } = DIMENSIONS[size];
  const center = box / 2;
  const ringColor = tone === 'onNavy' ? colors.secondaryLight : colors.primary;
  const coreColor = tone === 'onNavy' ? colors.secondary : colors.primary;
  const iconColor = colors.white;

  const ringRadii = [center - 2, center * 0.78, center * 0.62];

  return (
    <View style={[styles.box, { width: box, height: box }]}>
      <Svg width={box} height={box} style={StyleSheet.absoluteFillObject}>
        {ringRadii.map((r, i) => (
          <Circle
            key={r}
            cx={center}
            cy={center}
            r={r}
            stroke={ringColor}
            strokeWidth={1.5}
            strokeOpacity={0.35 - i * 0.1}
            fill="none"
          />
        ))}
      </Svg>
      <View
        style={[
          styles.core,
          { width: core, height: core, borderRadius: core / 2, backgroundColor: coreColor },
        ]}
      >
        <Ionicons name={icon} size={iconSize} color={iconColor} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
