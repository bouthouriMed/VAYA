import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { skipToken } from '@reduxjs/toolkit/query/react';
import {
  Text,
  Icon,
  Button,
  MapCanvas,
  BottomSheet,
  DraggableMapSheet,
  EmptyState,
  StopPin,
  useAppTheme,
  spacing,
  radii,
  regionForPoints,
  haptics,
  type DraggableMapSheetHandle,
} from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { selectPickupStop } from '../../src/state/searchSlice';
import { useMatchingSearchQuery, type MatchCandidate, type RankedStop } from '../../src/state/api';
import { decodePolyline } from '../../src/utils/polyline';
import { trackEvent } from '../../src/services/analytics/analytics';
import { defaultStopId, rankedPosition } from '../../src/features/pickup-selection/pickupSelection';

/**
 * Real ride-engine stop selection (docs/domain/ride-engine.md), replacing
 * the previous fixed-degrees-per-pixel projection fake — an arbitrary demo
 * mapping with no real geocoordinates behind it at all (docs/product/
 * audit.md §4, the single worst finding of the audit). Every point
 * rendered here is a real `route_stops` row the driver actually selected —
 * no free pin placement (CLAUDE.md product principle #1).
 *
 * Rebuilt onto the live theme (was pinned to the static `lightPalette`/
 * `colors` tokens — the one screen in the search flow still explicitly
 * flagged "legacy-light" in its own code) and a full-bleed map: the region
 * fitting every candidate stop used to be computed against the whole
 * screen while a fixed-height footer quietly ate the bottom third of it,
 * so stops near the bottom of the fitted region rendered outside the
 * actually-visible map area — the map "needed a manual zoom-out" not
 * because the fit math was wrong, but because the viewport it was fit
 * against wasn't the real one. The footer is now a DraggableMapSheet
 * instead: a floating, rounded panel the map renders fully behind, so the
 * region math and the visible viewport finally agree, and it drags down to
 * a peek (or springs back up on tap, or automatically when a new stop is
 * picked while collapsed) instead of permanently occupying fixed space.
 */
export default function PickupPointScreen(): React.JSX.Element {
  const { rideId, driverUserId } = useLocalSearchParams<{ rideId: string; driverUserId: string }>();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { colors: theme } = useAppTheme();
  const sheetRef = useRef<DraggableMapSheetHandle>(null);

  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const searchAt = useAppSelector((s) => s.search.searchAt);

  const searchArgs =
    origin && destination
      ? {
          originLat: origin.lat,
          originLng: origin.lng,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          when: searchAt ?? new Date().toISOString(),
        }
      : undefined;

  // Same args as results.tsx/cluster.tsx → served from RTK Query's cache,
  // no extra network round-trip for a ride the passenger already matched.
  const { data: searchResult, isLoading } = useMatchingSearchQuery(searchArgs ?? skipToken);
  const candidate = useMemo<MatchCandidate | undefined>(
    () => searchResult?.candidates.find((c) => c.rideId === rideId),
    [searchResult, rideId],
  );
  const rankedStops = useMemo(() => candidate?.rankedStops ?? [], [candidate]);

  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [detailStop, setDetailStop] = useState<RankedStop | null>(null);

  // Closest/best stop pre-selected by default — map-first hybrid per
  // docs/ux/principles.md #1, so the passenger doesn't have to scan a list
  // before anything is chosen.
  useEffect(() => {
    if (!selectedStopId && rankedStops.length > 0) {
      setSelectedStopId(defaultStopId(rankedStops));
    }
  }, [rankedStops, selectedStopId]);

  useEffect(() => {
    if (!isLoading && candidate && rankedStops.length === 0) {
      trackEvent('pickup_no_viable_stop', { rideId });
    }
    // Fire once per resolved (candidate, rankedStops) pair, not on every
    // unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, candidate, rankedStops.length]);

  const region = useMemo(() => {
    const points = rankedStops.map((s) => ({ lat: s.lat, lng: s.lng }));
    if (origin) points.push({ lat: origin.lat, lng: origin.lng });
    // A wider pad than the shared default (1.6x): the map is now genuinely
    // full-bleed, but the floating sheet still visually covers its own
    // bottom slice when expanded — the extra room keeps every stop clear of
    // that area at first glance, not just technically inside the fit.
    return regionForPoints(points, 2) ?? undefined;
  }, [rankedStops, origin]);

  const routeCoordinates = useMemo(
    () => (candidate?.routePolyline ? decodePolyline(candidate.routePolyline) : []),
    [candidate],
  );

  const selectedStop = rankedStops.find((s) => s.stopId === selectedStopId) ?? null;

  function pickStop(stop: RankedStop): void {
    haptics.selection();
    setSelectedStopId(stop.stopId);
    // A pin tapped while the sheet is collapsed (dragged down to see the
    // map) should bring the confirm action straight back into view — the
    // user just made the decision the sheet exists to act on.
    sheetRef.current?.expand();
  }

  function confirm(): void {
    if (!selectedStop) return;
    trackEvent('pickup_stop_selected', {
      rideId,
      stopId: selectedStop.stopId,
      rankedPosition: rankedPosition(rankedStops, selectedStop.stopId),
      totalStops: rankedStops.length,
    });
    dispatch(
      selectPickupStop({
        stopId: selectedStop.stopId,
        label: selectedStop.label,
        lat: selectedStop.lat,
        lng: selectedStop.lng,
      }),
    );
    // A route-passthrough match (Phase 13) also has ranked dropoff stops —
    // an endpoint match's dropoff is just the ride's own destination, so
    // this only ever routes onward for the former.
    if (candidate && candidate.rankedDropoffStops.length > 0) {
      router.push({ pathname: '/search/dropoff-point', params: { rideId, driverUserId } });
    } else {
      router.push({ pathname: '/search/ride-details', params: { rideId, driverUserId } });
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!candidate || rankedStops.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.backBtn, styles.backBtnStandalone, { backgroundColor: theme.surface, shadowColor: theme.ink }]}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={24} color={theme.ink} />
        </TouchableOpacity>
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<Ionicons name="location-outline" size={40} color={theme.inkFaint} />}
            title="Aucun point de rendez-vous accessible"
            description="Aucun arrêt de ce trajet n'est assez proche de votre position pour être rejoint à pied. Essayez un autre trajet ou ajustez votre recherche."
            actionLabel="Retour à la recherche"
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <MapCanvas region={region} style={styles.map}>
        {origin ? (
          <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.originDot, { backgroundColor: theme.accent, borderColor: theme.surface }]} />
          </Marker>
        ) : null}
        {routeCoordinates.length > 1 ? (
          <Polyline coordinates={routeCoordinates} strokeColor={theme.ink} strokeWidth={4} />
        ) : null}
        {rankedStops.map((stop, index) => {
          const isSelected = stop.stopId === selectedStopId;
          return (
            <Marker
              key={stop.stopId}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              onPress={() => pickStop(stop)}
              accessibilityLabel={`${stop.label}, ${Math.round(stop.walkMinutes)} min à pied`}
            >
              <StopPin theme={theme} index={index + 1} selected={isSelected} />
            </Marker>
          );
        })}
      </MapCanvas>

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.backBtn, { backgroundColor: theme.surface, shadowColor: theme.ink }]}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={24} color={theme.ink} />
        </TouchableOpacity>
        <View style={[styles.hint, { backgroundColor: theme.surface, shadowColor: theme.ink }]}>
          <Text variant="bodySmall" color={theme.inkMuted}>
            {rankedStops.length} point{rankedStops.length > 1 ? 's' : ''} sur ce trajet
          </Text>
        </View>
      </View>

      <View style={styles.sheetWrap} pointerEvents="box-none">
        <DraggableMapSheet ref={sheetRef} theme={theme} bottomInset={insets.bottom}>
          {selectedStop ? (
            <TouchableOpacity
              style={styles.footerRow}
              onPress={() => setDetailStop(selectedStop)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Détails du point ${selectedStop.label}`}
            >
              <View style={[styles.footerIcon, { backgroundColor: theme.accent }]}>
                <Icon name="pin" size="sm" color={theme.onAccent} />
              </View>
              <View style={styles.footerTextCol}>
                <Text variant="label" color={theme.ink} numberOfLines={1}>
                  {selectedStop.label}
                </Text>
                <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={1}>
                  {Math.round(selectedStop.walkMinutes)} min à pied
                </Text>
              </View>
              <Icon name="information-circle-outline" size="md" color={theme.inkFaint} />
            </TouchableOpacity>
          ) : null}
          <Button
            label="Confirmer ce point de rendez-vous"
            size="lg"
            theme={theme}
            onPress={confirm}
            disabled={!selectedStop}
            style={styles.cta}
          />
        </DraggableMapSheet>
      </View>

      <BottomSheet
        visible={detailStop !== null}
        onClose={() => setDetailStop(null)}
        title={detailStop?.label}
        theme={theme}
      >
        {detailStop ? (
          <View style={styles.sheetContent}>
            <Text variant="body" color={theme.inkMuted}>
              {Math.round(detailStop.walkMinutes)} min à pied depuis votre position de départ.
            </Text>
            <Text variant="bodySmall" color={theme.inkFaint}>
              Ce point a été validé par le conducteur comme arrêt sur son trajet.
            </Text>
            <Button
              label={detailStop.stopId === selectedStopId ? 'Point sélectionné' : 'Choisir ce point'}
              variant={detailStop.stopId === selectedStopId ? 'outline' : 'primary'}
              size="lg"
              theme={theme}
              disabled={detailStop.stopId === selectedStopId}
              onPress={() => {
                pickStop(detailStop);
                setDetailStop(null);
              }}
              style={styles.cta}
            />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
  },
  originDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  backBtnStandalone: {
    margin: spacing.md,
  },
  hint: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTextCol: {
    flex: 1,
  },
  cta: {
    width: '100%',
  },
  sheetContent: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
});
