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
import { selectPickupStop, selectOverriddenPickup } from '../../src/state/searchSlice';
import {
  useMatchingSearchQuery,
  useLazyGetPickupOverridePreviewQuery,
  type MatchCandidate,
  type RankedStop,
} from '../../src/state/api';
import { decodePolyline } from '../../src/utils/polyline';
import { trackEvent } from '../../src/services/analytics/analytics';
import { defaultStopId, rankedPosition } from '../../src/features/pickup-selection/pickupSelection';
import { formatDistance } from '../../src/utils/localeFormat';
import type { SupportedLocale } from '@vaya/config';

/**
 * Real ride-engine stop selection (docs/domain/ride-engine.md), replacing
 * the previous fixed-degrees-per-pixel projection fake — an arbitrary demo
 * mapping with no real geocoordinates behind it at all (docs/product/
 * audit.md §4, the single worst finding of the audit). Every point
 * rendered here is a real `route_stops` row the driver actually selected —
 * no free pin placement (CLAUDE.md product principle #1).
 */
export default function PickupPointScreen(): React.JSX.Element {
  const { rideId, driverUserId } = useLocalSearchParams<{ rideId: string; driverUserId: string }>();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation(['search', 'common', 'booking']);
  const locale = i18n.language as SupportedLocale;
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
  // M-040/EDGE-053 (docs/unified_driver_and_passenger_journey.md §14, edge
  // 53): "Passenger can override to another VAYA-feasible point." A real
  // coordinate the passenger long-pressed on the map — distinct from
  // `detailStop` (a driver-recommended stop's own detail sheet).
  const [overrideCandidate, setOverrideCandidate] = useState<{ lat: number; lng: number } | null>(null);
  const [fetchOverridePreview, overridePreviewState] = useLazyGetPickupOverridePreviewQuery();

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
    return regionForPoints(points) ?? undefined;
  }, [rankedStops, origin]);

  const routeCoordinates = useMemo(
    () => (candidate?.routePolyline ? decodePolyline(candidate.routePolyline) : []),
    [candidate],
  );

  const selectedStop = rankedStops.find((s) => s.stopId === selectedStopId) ?? null;

  function pickStop(stop: RankedStop): void {
    haptics.selection();
    setSelectedStopId(stop.stopId);
  }

  // Shared by both the driver-recommended-stop path and the M-040 override
  // path below — the "what screen comes next" decision doesn't depend on
  // which of the two the passenger actually picked.
  function advanceAfterPickupChosen(): void {
    // A route-passthrough match (Phase 13) also has ranked dropoff stops —
    // an endpoint match's dropoff is just the ride's own destination, so
    // this only ever routes onward for the former.
    if (candidate && candidate.rankedDropoffStops.length > 0) {
      router.push({ pathname: '/search/dropoff-point', params: { rideId, driverUserId } });
    } else {
      // This screen is only ever entered by pushing from ride-details.tsx's
      // "Request a seat" CTA now — dismissTo returns to that same instance
      // (the ride the rider was already looking at) instead of pushing a
      // fresh one on top, which would leave a stale duplicate underneath.
      router.dismissTo({ pathname: '/search/ride-details', params: { rideId, driverUserId } });
    }
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
    advanceAfterPickupChosen();
  }

  // M-040/EDGE-053: a real long-press anywhere on the map — VAYA
  // immediately recalculates the real walk/driver-detour impact
  // (previewPickupOverride) and shows it before the passenger can confirm,
  // never blocking on the result (a large detour is shown, not hidden or
  // rejected here — createBooking's own real bound is the actual gate).
  function handleMapLongPress(coordinate: { latitude: number; longitude: number }): void {
    haptics.selection();
    const point = { lat: coordinate.latitude, lng: coordinate.longitude };
    setOverrideCandidate(point);
    void fetchOverridePreview({
      rideId,
      lat: point.lat,
      lng: point.lng,
      requestedLat: origin?.lat,
      requestedLng: origin?.lng,
    });
  }

  function confirmOverride(): void {
    if (!overrideCandidate) return;
    trackEvent('pickup_override_selected', {
      rideId,
      withinAllowance: overridePreviewState.data?.withinAllowance ?? null,
    });
    dispatch(
      selectOverriddenPickup({
        label: t('search:pickupPoint.overrideSheetTitle'),
        lat: overrideCandidate.lat,
        lng: overrideCandidate.lng,
      }),
    );
    setOverrideCandidate(null);
    advanceAfterPickupChosen();
  }

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (!candidate || rankedStops.length === 0) {
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
            icon={<Ionicons name="location-outline" size={40} color={colors.gray400} />}
            title={t('search:pickupPoint.noStopClose')}
            description={t('search:pickupPoint.noStopCloseDesc')}
            actionLabel={t('search:pickupPoint.backToSearch')}
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapCanvas region={region} style={styles.map} onLongPress={handleMapLongPress}>
        {origin ? (
          <Marker
            coordinate={{ latitude: origin.lat, longitude: origin.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.originDot} />
          </Marker>
        ) : null}
        {routeCoordinates.length > 1 ? (
          <Polyline coordinates={routeCoordinates} strokeColor={colors.mapRouteLine} strokeWidth={4} />
        ) : null}
        {rankedStops.map((stop, index) => {
          const isSelected = stop.stopId === selectedStopId;
          return (
            <Marker
              key={stop.stopId}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              onPress={() => pickStop(stop)}
              accessibilityLabel={`${stop.label}, ${t('search:walk.suffix', { minutes: t('common:terms.minute', { count: Math.round(stop.walkMinutes) }) })}`}
            >
              {/* Same numbered pin as the driver publish map (design-system
               *  StopPin); this screen's chrome is still legacy-light, so it
               *  pins the fixed light palette rather than useAppTheme(). */}
              <StopPin theme={lightPalette} index={index + 1} selected={isSelected} />
            </Marker>
          );
        })}
        {overrideCandidate ? (
          <Marker
            coordinate={{ latitude: overrideCandidate.lat, longitude: overrideCandidate.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.overrideDot} />
          </Marker>
        ) : null}
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
            {t('search:pickupPoint.stopsOnRoute', { count: rankedStops.length })}
          </Text>
        </View>
      </View>

      {/* M-040/EDGE-053: a small, always-visible hint that the map itself
       *  is interactive beyond tapping a recommended stop — never the only
       *  way to discover the affordance, but never hidden either. */}
      <View style={[styles.overrideHintWrap, { top: insets.top + spacing.sm + 48 }]} pointerEvents="none">
        <View style={styles.overrideHintPill}>
          <Ionicons name="hand-left-outline" size={14} color={colors.gray500} />
          <Text variant="caption" color={colors.gray600}>
            {t('search:pickupPoint.overrideHint')}
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
            accessibilityLabel={t('search:pickupPoint.pointDetails', { label: selectedStop.label })}
          >
            <View style={styles.footerIcon}>
              <Ionicons name="pin" size={16} color={colors.white} />
            </View>
            <View style={styles.footerTextCol}>
              <Text style={styles.footerLabel}>{selectedStop.label}</Text>
              <Text variant="bodySmall" color={colors.gray500} numberOfLines={1}>
                {t('search:walk.suffix', { minutes: t('common:terms.minute', { count: Math.round(selectedStop.walkMinutes) }) })}
              </Text>
            </View>
            <Ionicons name="information-circle-outline" size={22} color={colors.gray400} />
          </TouchableOpacity>
        ) : null}
        <Button
          label={t('search:pickupPoint.confirmPickup')}
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
              {t('search:pickupPoint.walkFromOrigin', {
                minutes: t('common:terms.minute', { count: Math.round(detailStop.walkMinutes) }),
              })}
            </Text>
            <Text variant="bodySmall" color={colors.gray500}>
              {t('search:pickupPoint.driverValidatedStop')}
            </Text>
            <Button
              label={
                detailStop.stopId === selectedStopId
                  ? t('search:pickupPoint.selected')
                  : t('search:pickupPoint.choosePoint')
              }
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

      <BottomSheet
        visible={overrideCandidate !== null}
        onClose={() => setOverrideCandidate(null)}
        title={t('search:pickupPoint.overrideSheetTitle')}
      >
        {overrideCandidate ? (
          <View style={styles.sheetContent}>
            {overridePreviewState.isFetching ? (
              <View style={styles.overrideLoadingRow}>
                <ActivityIndicator size="small" color={colors.secondary} />
                <Text variant="bodySmall" color={colors.gray500}>
                  {t('search:pickupPoint.overrideLoading')}
                </Text>
              </View>
            ) : (
              <>
                {overridePreviewState.data?.walkMeters != null ? (
                  <Text variant="body" color={colors.gray700}>
                    {t('search:pickupPoint.overrideWalk', {
                      minutes: t('common:terms.minute', {
                        count: Math.max(1, Math.round(overridePreviewState.data.walkMeters / 80)),
                      }),
                    })}
                    {' · '}
                    {formatDistance(overridePreviewState.data.walkMeters, locale)}
                  </Text>
                ) : null}
                {overridePreviewState.data?.withinAllowance === true &&
                overridePreviewState.data.driverDetourExtraSeconds != null ? (
                  <Text variant="bodySmall" color={colors.gray500}>
                    {t('search:pickupPoint.overrideDetourImpact', {
                      duration: t('common:terms.minute', {
                        count: Math.max(1, Math.round(overridePreviewState.data.driverDetourExtraSeconds / 60)),
                      }),
                    })}
                  </Text>
                ) : overridePreviewState.data?.withinAllowance === false ? (
                  <Text variant="bodySmall" color={colors.warning}>
                    {t('search:pickupPoint.overrideNotFeasible')}
                  </Text>
                ) : (
                  <Text variant="bodySmall" color={colors.gray500}>
                    {t('search:pickupPoint.overrideDetourUnknown')}
                  </Text>
                )}
              </>
            )}
            <Button
              label={t('search:pickupPoint.overrideConfirm')}
              size="lg"
              onPress={confirmOverride}
              disabled={overridePreviewState.isFetching}
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
  originDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.secondary,
    borderWidth: 2,
    borderColor: colors.white,
  },
  overrideDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.warning,
    borderWidth: 2,
    borderColor: colors.white,
  },
  overrideHintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  overrideHintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  overrideLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
