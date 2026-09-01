import React, { useState } from 'react';
import { StyleSheet, View, Platform, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { radii, lightMapStyle, darkMapStyle } from '../tokens/index';
import { SkeletonBlock } from './Skeleton';
import { useAppTheme } from '../theme/AppThemeProvider';
import type { MapRegion } from '../utils/mapGeometry';

// Expo Go's shared binary has no way to carry this app's own Google Maps
// SDK key/config plugin (withGoogleMapsIOS, apps/mobile/app.config.js) — it's
// a generic client built once for every Expo app, not a rebuild of this one.
// Forcing PROVIDER_GOOGLE there mounts a MapView the native SDK was never
// initialized for, which crashes the app natively (no JS error, nothing
// catchable) the instant it renders — exactly what happened here: the small
// MapPreview thumbnail elsewhere on the same screen still defaults to
// PROVIDER_DEFAULT and works, while this primitive's explicit PROVIDER_GOOGLE
// only ever gets exercised the first time something using MapCanvas (e.g. the
// driver ride-hub's fullscreen route modal) actually mounts. A real dev-client
// or production build (Constants.executionEnvironment !== StoreClient) DOES
// have the key baked in via the config plugin, so it keeps the intended
// explicit Google provider there — this only degrades inside Expo Go.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

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
  /** M-040/EDGE-053 (docs/unified_driver_and_passenger_journey.md §14, edge
   *  53): fired with the real tapped coordinate on a sustained press — the
   *  primitive a "place a custom point" affordance builds on (e.g.
   *  search/pickup-point.tsx's override flow). Omit for a map with no such
   *  affordance (the default everywhere else). */
  onLongPress?: (coordinate: { latitude: number; longitude: number }) => void;
}

/**
 * Shared map "scene": a real react-native-maps MapView with VAYA's tile
 * tint wash and a skeleton shown until the map has actually rendered tiles
 * (onMapReady), instead of a blank frame. Phase 3 replaced the previous
 * CSS-art street-grid placeholder — see docs/design-system/README.md.
 */
export function MapCanvas({ height, region, style, children, onLongPress }: MapCanvasProps): React.JSX.Element {
  const [isReady, setIsReady] = useState(false);
  // Was hardcoded `customMapStyle={[]}` — the token file's own doc comment
  // already claimed MapCanvas followed useAppTheme()'s scheme, but nothing
  // actually wired it up, so every map rendered raw default-Google colors
  // (saturated yellow roads, bright blue water) regardless of theme. Real
  // gap, not a style preference — fixed to match the Stitch-reviewed
  // reference screens' muted sage/cream/blue-gray terrain.
  const { scheme, colors: theme } = useAppTheme();

  return (
    <View style={[styles.wrap, height !== undefined ? { height } : styles.flexFill, style]}>
      <MapView
        // Explicit Google Maps SDK on both platforms (was PROVIDER_DEFAULT,
        // which meant Apple Maps on iOS) — every VAYA map goes through this
        // one shared primitive, so this single line is the entire app's
        // Maps-SDK-provider selection. iOS additionally needs the native
        // GMSServices API key wired via the withGoogleMapsIOS config plugin
        // (apps/mobile/plugins/) — see apps/mobile/.env.example.
        provider={isExpoGo ? undefined : PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={region ?? DEFAULT_REGION}
        onMapReady={() => setIsReady(true)}
        onLongPress={onLongPress ? (e) => onLongPress(e.nativeEvent.coordinate) : undefined}
        // customMapStyle only takes effect on Google's renderer — Expo Go
        // always falls back to Apple Maps (PROVIDER_DEFAULT) on iOS,
        // which silently ignores it. `mapType="mutedStandard"` is
        // MapKit's own real desaturated style, the one lever that
        // actually mutes Apple Maps' rendering without a Google provider
        // — confirmed live, this prop alone had zero visible effect
        // while testing in Expo Go.
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        customMapStyle={scheme === 'dark' ? darkMapStyle : lightMapStyle}
      >
        {children}
      </MapView>
      {/* Brand tile wash — sits above raw tiles, doesn't intercept gestures.
       *  Was a fixed, legacy colors.mapTileTint (warm cream, 0.18 opacity) —
       *  too weak and the wrong hue to meaningfully change what's actually
       *  rendered underneath. mapType="mutedStandard" (Apple's own fixed
       *  style, the only lever Expo Go can reach) still comes out
       *  greenish/tan, confirmed live, nowhere near the Stitch reference's
       *  pale cool gray-blue map. theme.surfaceMuted at a real opacity —
       *  not a token-consuming color-only swap — is what actually pushes
       *  the visible result toward that reference, regardless of which
       *  renderer is active underneath. */}
      <View
        style={[styles.tint, { backgroundColor: theme.surfaceMuted, opacity: scheme === 'dark' ? 0.4 : 0.55 }]}
        pointerEvents="none"
      />
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
  // backgroundColor/opacity are always supplied inline (theme-aware,
  // scheme-dependent) — this only carries the shared position/layout.
  tint: {
    ...StyleSheet.absoluteFillObject,
  },
});
