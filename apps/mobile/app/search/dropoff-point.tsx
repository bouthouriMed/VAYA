import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useTranslation } from 'react-i18next';
import {
  Text,
  Button,
  MapCanvas,
  BottomSheet,
  EmptyState,
  StopPin,
  colors,
  lightPalette,
  spacing,
  radii,
  typography,
  regionForPoints,
  haptics,
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
 */
export default function DropoffPointScreen(): React.JSX.Element {
  const { rideId, driverUserId } = useLocalSearchParams<{ rideId: string; driverUserId: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(['search', 'common', 'booking']);
  const dispatch = useAppDispatch();

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
    return regionForPoints(points) ?? undefined;
  }, [rankedDropoffStops, destination]);

  const routeCoordinates = useMemo(
    () => (candidate?.routePolyline ? decodePolyline(candidate.routePolyline) : []),
    [candidate],
  );

  const selectedStop = rankedDropoffStops.find((s) => s.stopId === selectedStopId) ?? null;

  function pickStop(stop: RankedStop): void {
    haptics.selection();
    setSelectedStopId(stop.stopId);
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
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (!candidate || rankedDropoffStops.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.backBtn, styles.backBtnStandalone]}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.back')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.gray900} />
        </TouchableOpacity>
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<Ionicons name="flag-outline" size={40} color={colors.gray400} />}
            title={t('search:dropoffPoint.noDropoff')}
            description={t('search:dropoffPoint.noDropoffDesc')}
            actionLabel={t('search:pickupPoint.backToSearch')}
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapCanvas region={region} style={styles.map}>
        {destination ? (
          <Marker
            coordinate={{ latitude: destination.lat, longitude: destination.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.destinationDot} />
          </Marker>
        ) : null}
        {routeCoordinates.length > 1 ? (
          <Polyline coordinates={routeCoordinates} strokeColor={colors.mapRouteLine} strokeWidth={4} />
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
              {/* Same numbered pin as the driver publish map (design-system
               *  StopPin); this screen's chrome is still legacy-light, so it
               *  pins the fixed light palette rather than useAppTheme(). */}
              <StopPin theme={lightPalette} index={index + 1} selected={isSelected} />
            </Marker>
          );
        })}
      </MapCanvas>

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.back')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.gray900} />
        </TouchableOpacity>
        <View style={styles.hint}>
          <Text variant="bodySmall" color={colors.gray700}>
            Où souhaitez-vous descendre ?
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {selectedStop ? (
          <TouchableOpacity
            style={styles.footerRow}
            onPress={() => setDetailStop(selectedStop)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Détails du point ${selectedStop.label}`}
          >
            <View style={styles.footerIcon}>
              <Ionicons name="flag" size={16} color={colors.white} />
            </View>
            <View style={styles.footerTextCol}>
              <Text style={styles.footerLabel}>{selectedStop.label}</Text>
              <Text variant="bodySmall" color={colors.gray500} numberOfLines={1}>
                {Math.round(selectedStop.walkMinutes)} min à pied de votre destination
              </Text>
            </View>
            <Ionicons name="information-circle-outline" size={22} color={colors.gray400} />
          </TouchableOpacity>
        ) : null}
        <Button
          label={t('search:dropoffPoint.confirmDropoff')}
          size="lg"
          onPress={confirm}
          disabled={!selectedStop}
          style={styles.cta}
        />
      </View>

      <BottomSheet
        visible={detailStop !== null}
        onClose={() => setDetailStop(null)}
        title={detailStop?.label}
      >
        {detailStop ? (
          <View style={styles.sheetContent}>
            <Text variant="body" color={colors.gray700}>
              {Math.round(detailStop.walkMinutes)} min à pied jusqu&apos;à votre destination.
            </Text>
            <Text variant="bodySmall" color={colors.gray500}>
              Ce point a été validé par le conducteur comme arrêt sur son trajet.
            </Text>
            <Button
              label={detailStop.stopId === selectedStopId ? t('search:dropoffPoint.selected') : t('search:dropoffPoint.choosePoint')}
              variant={detailStop.stopId === selectedStopId ? 'outline' : 'primary'}
              size="lg"
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
    backgroundColor: colors.gray100,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  map: {
    flex: 1,
  },
  destinationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
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
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  backBtnStandalone: {
    margin: spacing.md,
  },
  hint: {
    backgroundColor: colors.white,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  footer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTextCol: {
    flex: 1,
  },
  footerLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray900,
  },
  cta: {
    width: '100%',
  },
  sheetContent: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
});
