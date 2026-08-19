import React from 'react';
import {
  View,
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radii } from '../tokens/index';
import type { Size } from '../utils/mapGeometry';

const H_LINES = [0.2, 0.42, 0.65, 0.85];
const V_LINES = [0.25, 0.5, 0.78];

interface MapCanvasProps {
  /** Fixed height, or omit to flex-fill the parent. */
  height?: number;
  onSizeChange?: (size: Size) => void;
  showStreetGrid?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Shared map "scene" background: measures its own laid-out size (so route
 * geometry / pin placement can be computed in pixels) and draws a faint
 * street-grid texture. This is a stylized placeholder — Phase 9 swaps it for
 * react-native-maps without changing how MapRoute/DriverMapPin consume it.
 */
export function MapCanvas({
  height,
  onSizeChange,
  showStreetGrid = true,
  style,
  children,
}: MapCanvasProps): React.JSX.Element {
  function handleLayout(e: LayoutChangeEvent): void {
    const { width, height: h } = e.nativeEvent.layout;
    onSizeChange?.({ width, height: h });
  }

  return (
    <View
      style={[styles.map, height !== undefined ? { height } : styles.flexFill, style]}
      onLayout={handleLayout}
    >
      {showStreetGrid ? (
        <View
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {H_LINES.map((f) => (
            <View key={`h${f}`} style={[styles.streetLine, { top: `${f * 100}%` }]} />
          ))}
          {V_LINES.map((f) => (
            <View
              key={`v${f}`}
              style={[styles.streetLine, styles.streetLineVertical, { left: `${f * 100}%` }]}
            />
          ))}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: colors.mapTileTint,
    borderRadius: radii.xl,
    position: 'relative',
    overflow: 'hidden',
  },
  flexFill: {
    flex: 1,
    minHeight: 200,
  },
  streetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.gray300,
    opacity: 0.6,
  },
  streetLineVertical: {
    top: 0,
    bottom: 0,
    left: 0,
    right: undefined,
    width: 1,
    height: undefined,
  },
});
