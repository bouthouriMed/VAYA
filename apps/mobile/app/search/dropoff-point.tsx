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
import { selectDropoffStop } from '../../src/state/searchSlice';
import { useMatchingSearchQuery, type MatchCandidate, type RankedStop } from '../../src/state/api';
import { decodePolyline } from '../../src/utils/polyline';
import { trackEvent } from '../../src/services/analytics/analytics';
import { defaultStopId, rankedPosition } from '../../src/features/pickup-selection/pickupSelection';

/**
 * Dropoff-side mirror of search/pickup-point.tsx (Phase 13, docs/roadmap/
 * phase-13-search-engine.md) — only ever reached for a route-passthrough
 * match (useOpenDriver/pickup-point.tsx only route here when the candidate
 * has `rankedDropoffStops`), since an endpoint match's dropoff is simply
 * the ride's own destination and needs no selection step at all. Every
 * point rendered here is a real `route_stops` row the driver actually
 * selected — same "never a free pin" guarantee (CLAUDE.md product
 * principle #1) pickup-point.tsx already holds, now extended to dropoff.
 *
 * Same theme + full-bleed-map + DraggableMapSheet rebuild as pickup-point.tsx
 * — see that file's doc comment for the reasoning (this screen was pinned
 * to the same static legacy tokens and had the exact same fixed-footer/
 * region-fit mismatch).
 */
export default function DropoffPointScreen(): React.JSX.Element {
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

  const { data: searchResult, isLoading } = useMatchingSearchQuery(searchArgs ?? skipToken);
  const candidate = useMemo<MatchCandidate | undefined>(
    () => searchResult?.candidates.find((c) => c.rideId === rideId),
    [searchResult, rideId],
  );
  const rankedDropoffStops = useMemo(() => candidate?.rankedDropoffStops ?? [], [candidate]);

  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [detailStop, setDetailStop] = useState<RankedStop | null>(null);

  useEffect(() => {
    if (!selectedStopId && rankedDropoffStops.length > 0) {
      setSelectedStopId(defaultStopId(rankedDropoffStops));
    }
  }, [rankedDropoffStops, selectedStopId]);

  const region = useMemo(() => {
    const points = rankedDropoffStops.map((s) => ({ lat: s.lat, lng: s.lng }));
    if (destination) points.push({ lat: destination.lat, lng: destination.lng });
    return regionForPoints(points, 2) ?? undefined;
  }, [rankedDropoffStops, destination]);

  const routeCoordinates = useMemo(
    () => (candidate?.routePolyline ? decodePolyline(candidate.routePolyline) : []),
    [candidate],
  );

  const selectedStop = rankedDropoffStops.find((s) => s.stopId === selectedStopId) ?? null;

  function pickStop(stop: RankedStop): void {
    haptics.selection();
    setSelectedStopId(stop.stopId);
    sheetRef.current?.expand();
  }

  function confirm(): void {
    if (!selectedStop) return;
    trackEvent('dropoff_stop_selected', {
      rideId,
      stopId: selectedStop.stopId,
      rankedPosition: rankedPosition(rankedDropoffStops, selectedStop.stopId),
      totalStops: rankedDropoffStops.length,
    });
    dispatch(
      selectDropoffStop({
        stopId: selectedStop.stopId,
        label: selectedStop.label,
        lat: selectedStop.lat,
        lng: selectedStop.lng,
      }),
    );
    router.push({ pathname: '/search/ride-details', params: { rideId, driverUserId } });
  }

  if (isLoading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!candidate || rankedDropoffStops.length === 0) {
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
            icon={<Ionicons name="flag-outline" size={40} color={theme.inkFaint} />}
            title="Aucun point de dépose accessible"
            description="Aucun arrêt de ce trajet n'est assez proche de votre destination pour être rejoint à pied. Essayez un autre trajet ou ajustez votre recherche."
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
        {destination ? (
          <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.destinationDot, { backgroundColor: theme.ink, borderColor: theme.surface }]} />
          </Marker>
        ) : null}
        {routeCoordinates.length > 1 ? (
          <Polyline coordinates={routeCoordinates} strokeColor={theme.ink} strokeWidth={4} />
        ) : null}
        {rankedDropoffStops.map((stop, index) => {
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
            Où souhaitez-vous descendre ?
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
              <View style={[styles.footerIcon, { backgroundColor: theme.ink }]}>
                <Icon name="flag" size="sm" color={theme.onInk} />
              </View>
              <View style={styles.footerTextCol}>
                <Text variant="label" color={theme.ink} numberOfLines={1}>
                  {selectedStop.label}
                </Text>
                <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={1}>
                  {Math.round(selectedStop.walkMinutes)} min à pied de votre destination
                </Text>
              </View>
              <Icon name="information-circle-outline" size="md" color={theme.inkFaint} />
            </TouchableOpacity>
          ) : null}
          <Button
            label="Confirmer ce point de dépose"
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
              {Math.round(detailStop.walkMinutes)} min à pied jusqu&apos;à votre destination.
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
  destinationDot: {
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
