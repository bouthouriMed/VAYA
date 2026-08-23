import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import {
  Text,
  Icon,
  GlassSurface,
  regionForPoints,
  haptics,
  spacing,
  radii,
  type AppPalette,
} from '@vaya/design-system';
import { useLazyGeocodeReverseQuery } from '../../state/api';
import type { RecommendedPoint } from './nearestStops';

export interface ConfirmedPoint {
  label: string;
  lat: number;
  lng: number;
  /** The real route_stop id this point resolves to, or null for a
   *  freehand/custom pin placement that doesn't match a generated stop. */
  stopId: string | null;
}

interface MapSelectionModeProps {
  theme: AppPalette;
  scheme: 'light' | 'dark';
  anchor: { label: string; lat: number; lng: number };
  recommendedPoints: RecommendedPoint[];
  title: string;
  subtitle: string;
  confirmLabel: string;
  onConfirm: (point: ConfirmedPoint) => void;
  onBack: () => void;
  /** Candidate-stop generation (§19) is still running in the background —
   *  `recommendedPoints` may still grow as it completes. The anchor itself
   *  is always available, so this never blocks placing/confirming a point. */
  isLoadingRecommended?: boolean;
  /** OSRM was unreachable for this ride — an honest state, never a silently
   *  empty "5 recommended points" that looks like a design decision. */
  recommendedUnavailable?: boolean;
}

const SPRING_CONFIG = { damping: 20, stiffness: 220 };

function CenterPin({ theme, isDragging }: { theme: AppPalette; isDragging: boolean }): React.JSX.Element {
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

/**
 * The shared "focus the map, pick a precise meeting point" workspace behind
 * Publish's pickup AND drop-off selection (docs: Publish Explorer spec §6-11)
 * — the same component drives both, parameterized by anchor/copy/callbacks,
 * so there is exactly one implementation of this interaction, not two.
 *
 * Interaction: a fixed center pin stays visually anchored while the user
 * pans the map underneath it (Uber/Google-Maps-style), OR the user taps one
 * of the ~5 real recommended points (route_stops nearest the anchor, plus
 * the anchor itself — see nearestStops.ts) to snap the map there instead.
 * Panning away from a recommended point reverts to freehand/custom mode and
 * reverse-geocodes the new center via the existing /geocoding/reverse
 * endpoint for a human-readable label.
 */
export function MapSelectionMode({
  theme,
  scheme,
  anchor,
  recommendedPoints,
  title,
  subtitle,
  confirmLabel,
  onConfirm,
  onBack,
  isLoadingRecommended = false,
  recommendedUnavailable = false,
}: MapSelectionModeProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const isProgrammaticMove = useRef(false);

  const initialRegion = useMemo(
    () => regionForPoints(recommendedPoints.map((p) => ({ lat: p.lat, lng: p.lng }))) ?? {
      latitude: anchor.lat,
      longitude: anchor.lng,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    },
    // Only computed once, from the point set this mode opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [selectedPointId, setSelectedPointId] = useState<string | null>('anchor');
  const [center, setCenter] = useState({ lat: anchor.lat, lng: anchor.lng });
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fetchReverseGeocode, { isFetching: isResolvingLabel }] = useLazyGeocodeReverseQuery();

  const selectedRecommended = recommendedPoints.find((p) => p.id === selectedPointId) ?? null;
  const resolvedLabel = selectedRecommended?.label ?? customLabel;

  function focusOn(point: { lat: number; lng: number }): void {
    isProgrammaticMove.current = true;
    mapRef.current?.animateToRegion(
      { latitude: point.lat, longitude: point.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      350,
    );
  }

  function pickRecommended(point: RecommendedPoint): void {
    haptics.selection();
    setSelectedPointId(point.id);
    setCenter({ lat: point.lat, lng: point.lng });
    setCustomLabel(null);
    focusOn(point);
  }

  function handlePanDrag(): void {
    if (isProgrammaticMove.current) return;
    if (!isDragging) setIsDragging(true);
    if (selectedPointId !== null) setSelectedPointId(null);
  }

  function handleRegionChangeComplete(region: Region): void {
    setIsDragging(false);
    if (isProgrammaticMove.current) {
      isProgrammaticMove.current = false;
      return;
    }
    if (selectedPointId !== null) return; // settled from a recommended-point animation
    const next = { lat: region.latitude, lng: region.longitude };
    setCenter(next);
    void fetchReverseGeocode(next)
      .unwrap()
      .then((result) => setCustomLabel(result.label))
      .catch(() => setCustomLabel('Position personnalisée'));
  }

  function confirm(): void {
    if (!resolvedLabel) return;
    haptics.success();
    onConfirm({ label: resolvedLabel, lat: center.lat, lng: center.lng, stopId: selectedRecommended?.stopId ?? null });
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        onPanDrag={handlePanDrag}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {recommendedPoints.map((point, index) => (
          <Marker
            key={point.id}
            coordinate={{ latitude: point.lat, longitude: point.lng }}
            onPress={() => pickRecommended(point)}
            accessibilityLabel={point.label}
            zIndex={point.id === selectedPointId ? 10 : 1}
          >
            <View
              style={[
                styles.stopPin,
                { borderColor: theme.outline, backgroundColor: theme.surface },
                point.id === selectedPointId && { backgroundColor: theme.ink, borderColor: theme.ink },
              ]}
            >
              {point.isAnchor ? (
                <Icon
                  name="flag"
                  size="xs"
                  color={point.id === selectedPointId ? theme.onInk : theme.ink}
                />
              ) : (
                <Text
                  variant="caption"
                  color={point.id === selectedPointId ? theme.onInk : theme.ink}
                  style={styles.stopPinLabel}
                >
                  {index}
                </Text>
              )}
            </View>
          </Marker>
        ))}
      </MapView>

      <CenterPin theme={theme} isDragging={isDragging} />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={onBack}
          hitSlop={12}
          style={[styles.roundBtn, { backgroundColor: theme.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Icon name="arrow-back" size="sm" color={theme.ink} />
        </TouchableOpacity>

        <GlassSurface theme={theme} scheme={scheme} radius="lg" style={styles.instructionCard}>
          <Text variant="label" color={theme.ink}>
            {title}
          </Text>
          <Text variant="caption" color={theme.inkMuted}>
            {subtitle}
          </Text>
          {isLoadingRecommended ? (
            <Text variant="caption" color={theme.inkFaint}>
              Recherche de suggestions…
            </Text>
          ) : recommendedUnavailable ? (
            <Text variant="caption" color={theme.inkFaint}>
              Suggestions indisponibles pour le moment — placez le point vous-même.
            </Text>
          ) : null}
        </GlassSurface>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <GlassSurface theme={theme} scheme={scheme} radius="xl" style={styles.confirmCard}>
          <View style={styles.confirmRow}>
            <View style={[styles.confirmIcon, { backgroundColor: theme.surfaceMuted }]}>
              {isResolvingLabel ? (
                <ActivityIndicator size="small" color={theme.ink} />
              ) : (
                <Icon name="pin" size="sm" color={theme.ink} />
              )}
            </View>
            <View style={styles.confirmTextCol}>
              <Text variant="caption" color={theme.inkFaint}>
                Point sélectionné
              </Text>
              <Text variant="label" color={theme.ink} numberOfLines={1}>
                {isResolvingLabel ? 'Résolution du lieu…' : (resolvedLabel ?? 'Déplacez la carte')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: theme.ink }, (!resolvedLabel || isResolvingLabel) && styles.confirmBtnDisabled]}
            onPress={confirm}
            disabled={!resolvedLabel || isResolvingLabel}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
          >
            <Text variant="label" color={theme.onInk}>
              {confirmLabel}
            </Text>
          </TouchableOpacity>
        </GlassSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  stopPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  stopPinLabel: {
    fontWeight: '700',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: spacing.sm,
  },
  instructionCard: {
    padding: spacing.md,
    gap: 2,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
  },
  confirmCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  confirmIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTextCol: {
    flex: 1,
  },
  confirmBtn: {
    minHeight: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
});
