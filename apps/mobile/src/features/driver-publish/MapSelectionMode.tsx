import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { StopPin, type AppPalette } from '@vaya/design-system';
import type { RecommendedPoint } from './nearestStops';

const SPRING_CONFIG = { damping: 20, stiffness: 220 };

/**
 * The fixed-center "you're dragging a pin" marker for pickup/dropoff
 * selection (Publish Explorer spec §7) — an absolutely-positioned overlay,
 * NOT a react-native-maps `Marker` (it stays visually anchored to the
 * screen center while the map pans underneath it, Uber/Google-Maps-style).
 * Lifts and its shadow contracts while the map is actively being dragged,
 * settling back down on release — real physical feedback, not a static pin.
 */
export function CenterPin({ theme, isDragging }: { theme: AppPalette; isDragging: boolean }): React.JSX.Element {
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = isDragging ? withTiming(1, { duration: 140 }) : withSpring(0, SPRING_CONFIG);
  }, [isDragging, lift]);

  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 10 }, { scale: 1 + lift.value * 0.12 }],
  }));
  const shadowStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 - lift.value * 0.35 }],
    opacity: 0.35 - lift.value * 0.15,
  }));

  return (
    <View pointerEvents="none" style={styles.centerPinWrap}>
      <Animated.View style={pinStyle}>
        <View style={[styles.pinBody, { backgroundColor: theme.ink, borderColor: theme.surface }]}>
          <View style={[styles.pinDot, { backgroundColor: theme.accent }]} />
        </View>
      </Animated.View>
      <Animated.View style={[styles.pinShadow, shadowStyle]} />
    </View>
  );
}

/** One real, road-snapped (or anchor) recommended point on the map — a
 *  flag for the anchor itself, a number for every other candidate, filled
 *  solid when selected. Kept as one shared piece so pickup and drop-off
 *  render identically. The circle/label visual itself is the design-system
 *  StopPin, shared with the passenger stop-selection maps. */
export function RecommendedPointMarker({
  point,
  index,
  isSelected,
  theme,
  onPress,
}: {
  point: RecommendedPoint;
  index: number;
  isSelected: boolean;
  theme: AppPalette;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Marker
      coordinate={{ latitude: point.lat, longitude: point.lng }}
      onPress={onPress}
      accessibilityLabel={point.label}
      zIndex={isSelected ? 10 : 1}
    >
      <StopPin theme={theme} index={index} selected={isSelected} flag={point.isAnchor} />
    </Marker>
  );
}

const styles = StyleSheet.create({
  centerPinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -18,
    marginTop: -44,
    alignItems: 'center',
  },
  pinBody: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderBottomLeftRadius: 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-45deg' }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    transform: [{ rotate: '45deg' }],
  },
  pinShadow: {
    width: 18,
    height: 6,
    borderRadius: 9,
    backgroundColor: '#000',
    marginTop: 2,
  },
});
