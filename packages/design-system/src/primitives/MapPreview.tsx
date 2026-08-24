import React, { useState } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type LatLng } from 'react-native-maps';
import { colors, radii, spacing, typography } from '../tokens/index';
import { regionForPoints, type LatLngPoint, type MapRegion } from '../utils/mapGeometry';
import { SkeletonBlock } from './Skeleton';
import { PickupPin, DropoffPin } from './RideStopMarkers';
import type { AppPalette } from '../theme/palette';

const DEFAULT_REGION: MapRegion = {
  latitude: 36.8,
  longitude: 10.18,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

/** Standard, widely-used dark Google Maps style JSON — without this,
 *  customMapStyle={[]} (Google's default) always renders light tiles
 *  regardless of the app's own theme, which reads as a bright, jarring
 *  rectangle dropped into an otherwise dark-themed card. Only applied
 *  when `isDark` is explicitly passed true; every existing caller that
 *  doesn't pass it keeps the unchanged default light style. */
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a2226' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a2226' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ba0a6' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3a4750' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3841' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a31' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4750' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#101a1f' }] },
];

interface MapPreviewProps {
  height?: number;
  badge?: string;
  origin?: LatLng;
  destination?: LatLng;
  /** The ride's real, precise meeting points (a driver-confirmed
   *  route_stop, not just the general origin/destination search result) —
   *  when given (with `theme`), these render as the premium PickupPin/
   *  DropoffPin pair INSTEAD of the plain origin/destination dots, since
   *  they're the more accurate "where passengers actually meet" points.
   *  Falls back to the origin/destination dots when either is absent, so
   *  every existing caller without stop data keeps working unchanged. */
  pickup?: LatLng;
  dropoff?: LatLng;
  /** Required to color PickupPin/DropoffPin — only needed when passing
   *  `pickup`/`dropoff`. */
  theme?: AppPalette;
  /** Applies DARK_MAP_STYLE instead of Google's default light tiles.
   *  Defaults to false (unchanged behavior) — pass `scheme === 'dark'`
   *  from useAppTheme() wherever this preview sits inside a themed,
   *  dark-capable screen. */
  isDark?: boolean;
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
  pickup,
  dropoff,
  theme,
  isDark = false,
  routeCoordinates,
  style,
  children,
}: MapPreviewProps): React.JSX.Element {
  const [isReady, setIsReady] = useState(false);
  const points: LatLngPoint[] = [pickup ?? origin, dropoff ?? destination]
    .filter((p): p is LatLng => Boolean(p))
    .map((p) => ({ lat: p.latitude, lng: p.longitude }));
  const region = regionForPoints(points) ?? DEFAULT_REGION;
  const showPremiumPins = Boolean(pickup && dropoff && theme);

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
        customMapStyle={isDark ? DARK_MAP_STYLE : []}
      >
        {routeCoordinates && routeCoordinates.length > 1 ? (
          <Polyline coordinates={routeCoordinates} strokeColor={colors.mapRouteLine} strokeWidth={3} />
        ) : null}
        {showPremiumPins && pickup && dropoff && theme ? (
          <>
            <Marker coordinate={pickup} anchor={{ x: 0.5, y: 0.5 }}>
              <PickupPin theme={theme} />
            </Marker>
            <Marker coordinate={dropoff} anchor={{ x: 0.5, y: 0.5 }}>
              <DropoffPin theme={theme} />
            </Marker>
          </>
        ) : (
          <>
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
          </>
        )}
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
