import React, { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import { colors, radii } from '../tokens/index';
import { SkeletonBlock } from './Skeleton';
import type { MapRegion } from '../utils/mapGeometry';

// Wide default so a MapCanvas rendered before any real region is known
// (e.g. before a search result loads) still shows recognizable terrain
// instead of an ocean tile or the 0,0 null-island default.
const DEFAULT_REGION: MapRegion = {
  latitude: 36.8,
  longitude: 10.18,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

interface MapCanvasProps {
  /** Fixed height, or omit to flex-fill the parent. */
  height?: number;
  region?: MapRegion;
  style?: StyleProp<ViewStyle>;
  /** react-native-maps children only (Marker/Polyline/Circle/etc.) — they
   *  render inside the real MapView, not as arbitrarily-positioned overlay
   *  Views the way the old placeholder canvas allowed. */
  children?: React.ReactNode;
}

/**
 * Shared map "scene": a real react-native-maps MapView with VAYA's tile
 * tint wash and a skeleton shown until the map has actually rendered tiles
 * (onMapReady), instead of a blank frame. Phase 3 replaced the previous
 * CSS-art street-grid placeholder — see docs/design-system/README.md.
 */
export function MapCanvas({ height, region, style, children }: MapCanvasProps): React.JSX.Element {
  const [isReady, setIsReady] = useState(false);

  return (
    <View style={[styles.wrap, height !== undefined ? { height } : styles.flexFill, style]}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFillObject}
        initialRegion={region ?? DEFAULT_REGION}
        onMapReady={() => setIsReady(true)}
        // Forces the default light Google Maps style regardless of the
        // device's system dark-mode setting (Android can otherwise render
        // tiles dark even in a forced-light app).
        customMapStyle={[]}
      >
        {children}
      </MapView>
      {/* Brand tile wash — sits above raw tiles, doesn't intercept gestures. */}
      <View style={styles.tint} pointerEvents="none" />
      {!isReady ? <SkeletonBlock radius="none" style={StyleSheet.absoluteFillObject} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  flexFill: {
    flex: 1,
    minHeight: 200,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.mapTileTint,
    opacity: 0.18,
  },
});
