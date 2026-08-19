import React, { useState } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type LatLng } from 'react-native-maps';
import { colors, radii, spacing, typography } from '../tokens/index';
import { regionForPoints, type LatLngPoint, type MapRegion } from '../utils/mapGeometry';
import { SkeletonBlock } from './Skeleton';

const DEFAULT_REGION: MapRegion = {
  latitude: 36.8,
  longitude: 10.18,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

interface MapPreviewProps {
  height?: number;
  badge?: string;
  origin?: LatLng;
  destination?: LatLng;
  /** Decoded route geometry (see MapRoute's coordinates prop). */
  routeCoordinates?: LatLng[];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Small, non-interactive MapView snapshot for list/card contexts (a ride
 * card thumbnail, a trip-day pickup preview). Real tiles + real geometry —
 * Phase 3 replaced the previous angled-line-on-a-tinted-box placeholder.
 */
export function MapPreview({
  height = 160,
  badge,
  origin,
  destination,
  routeCoordinates,
  style,
  children,
}: MapPreviewProps): React.JSX.Element {
  const [isReady, setIsReady] = useState(false);
  const points: LatLngPoint[] = [origin, destination]
    .filter((p): p is LatLng => Boolean(p))
    .map((p) => ({ lat: p.latitude, lng: p.longitude }));
  const region = regionForPoints(points) ?? DEFAULT_REGION;

  return (
    <View style={[styles.wrap, { height }, style]}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        pointerEvents="none"
        onMapReady={() => setIsReady(true)}
      >
        {routeCoordinates && routeCoordinates.length > 1 ? (
          <Polyline coordinates={routeCoordinates} strokeColor={colors.mapRouteLine} strokeWidth={3} />
        ) : null}
        {origin ? (
          <Marker coordinate={origin} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.markerDot, { backgroundColor: colors.mapUserMarker }]} />
          </Marker>
        ) : null}
        {destination ? (
          <Marker coordinate={destination} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.markerDot, { backgroundColor: colors.mapDriverMarker }]} />
          </Marker>
        ) : null}
      </MapView>
      <View style={styles.tint} pointerEvents="none" />
      {!isReady ? <SkeletonBlock radius="none" style={StyleSheet.absoluteFillObject} /> : null}
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
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.mapTileTint,
    opacity: 0.18,
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.white,
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
