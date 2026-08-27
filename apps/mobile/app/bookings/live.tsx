import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, type LayoutChangeEvent } from 'react-native';
import { Marker, MarkerAnimated, AnimatedRegion } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  clamp,
} from 'react-native-reanimated';
import {
  Text,
  Icon,
  Button,
  MapCanvas,
  MapRoute,
  PickupPin,
  DropoffPin,
  useAppTheme,
  spacing,
  radii,
  regionForPoints,
} from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';
import { NoShowReportSheet } from '../../src/features/bookings/NoShowReportSheet';
import { useGetTripByBookingQuery, type TrackingStatus } from '../../src/state/api';
import { useTripTracking } from '../../src/features/tracking/useTripTracking';
import { decodePolyline } from '../../src/utils/polyline';
import { useCallCounterpart } from '../../src/features/bookings/useCallCounterpart';

// How much of the bottom sheet stays visible when dragged down — enough for
// the drag handle, the status line, and the Call/Message row, so the sheet
// never fully disappears (there's always a way to see it's still there and
// pull it back up).
const PEEK_HEIGHT = 132;

/** A small colored dot conveying the tracking feed's own health at a
 *  glance (live-tracking.md's core principle: never present a stale/missing
 *  fix as if it were current) — pulsing green when genuinely live, amber
 *  when stale, red/grey otherwise. Single-use, kept local rather than a new
 *  design-system primitive until a second screen needs it. */
function TrackingStatusDot({ color }: { color: string }): React.JSX.Element {
  return <View style={[styles.statusDot, { backgroundColor: color }]} />;
}

function toneForTrackingStatus(status: TrackingStatus, theme: ReturnType<typeof useAppTheme>['colors']): string {
  switch (status) {
    case 'live':
      return theme.accent;
    case 'stale':
      return theme.warning ?? '#B08A4E';
    case 'unavailable':
      return theme.error;
    default:
      return theme.inkFaint;
  }
}

/** Animates the driver marker between successive position pushes instead of
 *  teleporting it — `AnimatedRegion.timing` is the standard react-native-maps
 *  pattern for this. Heading rotates the puck via the Marker's own
 *  `rotation` prop (degrees clockwise from north), not a separate transform. */
function AnimatedDriverMarker({
  lat,
  lng,
  headingDeg,
  color,
}: {
  lat: number;
  lng: number;
  headingDeg: number | null;
  color: string;
}): React.JSX.Element {
  const animatedRegion = useRef(
    new AnimatedRegion({ latitude: lat, longitude: lng, latitudeDelta: 0, longitudeDelta: 0 }),
  ).current;
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    animatedRegion
      .timing({
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: 1000,
        useNativeDriver: false,
        toValue: 0,
      } as never)
      .start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <MarkerAnimated coordinate={animatedRegion} anchor={{ x: 0.5, y: 0.5 }} rotation={headingDeg ?? 0} flat>
      <View style={[styles.driverPuck, { backgroundColor: color }]}>
        <Ionicons name="navigate" size={16} color="#FFFFFF" />
      </View>
    </MarkerAnimated>
  );
}

export default function LiveScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const { t } = useTranslation(['booking', 'activeTrip', 'common']);
  const params = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    price?: string;
    vehicleLabel?: string;
    destinationLabel?: string;
  }>();
  const driverName = params.driverName ?? t('common:terms.driver');
  const [cancelling, setCancelling] = useState(false);
  const [reportingNoShow, setReportingNoShow] = useState(false);
  const [issueBannerDismissed, setIssueBannerDismissed] = useState(false);

  const { data: trip } = useGetTripByBookingQuery(params.bookingId ?? '', { skip: !params.bookingId });
  const { call, isLoading: isCalling } = useCallCounterpart(params.bookingId ?? '');
  const {
    trackingState,
    connectionState,
    trackingIssueReported,
    acknowledgeTrackingIssue,
    etaSec,
  } = useTripTracking(trip?.id);

  const trackingStatus = trackingState?.trackingStatus ?? 'not_started';
  const routeCoordinates = useMemo(
    () => (trackingState?.routePolyline ? decodePolyline(trackingState.routePolyline) : []),
    [trackingState?.routePolyline],
  );
  const hasDriverFix = trackingState?.currentLat != null && trackingState?.currentLng != null;

  // The real, honest "trip is over" signal — replaces the old
  // setTimeout(4000) mock outright. Never fires while the rider is mid-flow
  // on a cancellation/no-show report.
  useEffect(() => {
    if (cancelling || reportingNoShow) return;
    if (trackingState?.tripStatus === 'completed') {
      router.replace({ pathname: '/bookings/settlement', params });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingState?.tripStatus, cancelling, reportingNoShow]);

  useEffect(() => {
    if (trackingIssueReported) setIssueBannerDismissed(false);
  }, [trackingIssueReported]);

  const region = useMemo(() => {
    if (!trackingState) return undefined;
    const points = [
      { lat: trackingState.pickup.lat, lng: trackingState.pickup.lng },
      { lat: trackingState.destination.lat, lng: trackingState.destination.lng },
    ];
    if (hasDriverFix) points.push({ lat: trackingState.currentLat!, lng: trackingState.currentLng! });
    return regionForPoints(points) ?? undefined;
  }, [trackingState, hasDriverFix]);

  const dotColor = toneForTrackingStatus(trackingStatus, theme);

  // Draggable bottom sheet (pull down to see the full map, pull back up for
  // trip details) — the map now fills the whole screen behind it
  // (styles.mapWrap is absolute-fill) rather than sharing space as a flex
  // sibling, so collapsing the sheet actually reveals more map instead of
  // the map staying whatever fixed size it already was.
  const sheetHeight = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const collapsedOffset = useSharedValue(0);

  function onCardLayout(event: LayoutChangeEvent): void {
    const height = event.nativeEvent.layout.height;
    sheetHeight.value = height;
    // Peek height ~= header row + its vertical padding — enough to still
    // read the live-tracking status line and reach Call/Message while
    // collapsed.
    collapsedOffset.value = Math.max(0, height - PEEK_HEIGHT);
  }

  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateY.value = clamp(dragStartY.value + event.translationY, 0, collapsedOffset.value);
    })
    .onEnd((event) => {
      const shouldCollapse =
        event.velocityY > 300 || (event.velocityY > -300 && translateY.value > collapsedOffset.value / 2);
      translateY.value = withSpring(shouldCollapse ? collapsedOffset.value : 0, {
        damping: 22,
        stiffness: 220,
      });
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  function headerLine(): string {
    // Trip-progress state takes priority over the raw ETA countdown once
    // it says something more specific and actionable — "you're arriving,
    // get ready to get off" matters more than "3 min" once it's true.
    if (trackingStatus === 'live' && trackingState?.tripStatus === 'pickup') {
      return t('activeTrip:driverArrived');
    }
    if (trackingStatus === 'live' && trackingState?.tripStatus === 'arriving') {
      return t('activeTrip:arrivingSoon');
    }
    if (trackingStatus === 'live' && etaSec !== null) {
      return t('activeTrip:etaLabel', { minutes: Math.max(1, Math.round(etaSec / 60)) });
    }
    if (trackingStatus === 'starting' || trackingStatus === 'not_started') {
      return t('activeTrip:waitingForDriver');
    }
    if (trackingStatus === 'stale') return t('activeTrip:staleSignal');
    if (trackingStatus === 'unavailable') return t('activeTrip:unavailable');
    return t('activeTrip:liveTracking');
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.mapWrap}>
        <MapCanvas region={region} style={styles.map}>
          {trackingState && routeCoordinates.length > 1 ? (
            <MapRoute coordinates={routeCoordinates} color={theme.accent} />
          ) : null}
          {trackingState ? (
            <Marker
              coordinate={{ latitude: trackingState.pickup.lat, longitude: trackingState.pickup.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <PickupPin theme={theme} />
            </Marker>
          ) : null}
          {trackingState ? (
            <Marker
              coordinate={{ latitude: trackingState.destination.lat, longitude: trackingState.destination.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <DropoffPin theme={theme} />
            </Marker>
          ) : null}
          {/* Frozen/greyed rather than absent once we've seen a real fix at
              least once, even if the feed has since gone stale/unavailable —
              never hide the last known position, per this screen's own
              honesty rule (only the color communicates confidence). */}
          {hasDriverFix ? (
            <AnimatedDriverMarker
              lat={trackingState!.currentLat!}
              lng={trackingState!.currentLng!}
              headingDeg={trackingState!.currentHeadingDeg}
              color={trackingStatus === 'unavailable' ? theme.inkFaint : theme.ink}
            />
          ) : null}
        </MapCanvas>

        {trackingIssueReported && !issueBannerDismissed ? (
          <View style={[styles.floatingBanner, { backgroundColor: theme.surface, borderColor: theme.warning ?? theme.outline }]}>
            <Icon name="warning-outline" size="sm" color={theme.warning ?? theme.error} />
            <Text variant="bodySmall" color={theme.ink} style={styles.floatingBannerText}>
              {t('activeTrip:trackingIssueBanner')}
            </Text>
            <Button
              theme={theme}
              label={t('common:actions.close')}
              variant="ghost"
              size="sm"
              onPress={() => {
                setIssueBannerDismissed(true);
                acknowledgeTrackingIssue();
              }}
            />
          </View>
        ) : null}
      </View>

      <GestureDetector gesture={panGesture}>
        <Reanimated.View
          onLayout={onCardLayout}
          style={[
            styles.card,
            { backgroundColor: theme.surface, paddingBottom: spacing.xl + insets.bottom },
            sheetAnimatedStyle,
          ]}
        >
          <View style={[styles.dragHandle, { backgroundColor: theme.outlineVariant }]} />
          <View style={styles.headerRow}>
            <View style={styles.headerTextRow}>
              <TrackingStatusDot color={dotColor} />
              <Text variant="h1" color={theme.ink}>
                {headerLine()}
              </Text>
            </View>
          {params.bookingId ? (
            <View style={styles.headerActions}>
              <Button
                theme={theme}
                label={t('common:actions.call')}
                variant="outline"
                size="sm"
                accessibilityLabel={t('common:actions.call', { name: driverName.split(' ')[0] })}
                onPress={call}
                disabled={isCalling}
              />
              <Button
                theme={theme}
                label={t('common:actions.message')}
                variant="outline"
                size="sm"
                accessibilityLabel={t('common:actions.message', { name: driverName.split(' ')[0] })}
                onPress={() =>
                  router.push({
                    pathname: '/conversations/[bookingId]',
                    params: {
                      bookingId: params.bookingId!,
                      role: 'rider',
                      otherPartyName: driverName,
                    },
                  })
                }
              />
            </View>
          ) : null}
        </View>
        <Text variant="body" color={theme.inkMuted}>
          {trackingState?.destination.label ?? params.destinationLabel ?? ''}
        </Text>

        {!trackingState ? (
          <ActivityIndicator size="small" color={theme.accent} style={styles.loading} />
        ) : null}
        {connectionState === 'unauthorized' ? (
          <Text variant="bodySmall" color={theme.error} style={styles.errorText}>
            {t('activeTrip:unauthorized')}
          </Text>
        ) : null}

        {params.bookingId ? (
          <View style={styles.tripActions}>
            <Button
              theme={theme}
              label={t('activeTrip:noShowReport')}
              variant="ghost"
              size="sm"
              onPress={() => setReportingNoShow(true)}
            />
            {/* Server-enforced too (bookings.service.ts's
                assertTripNotStarted) — once the driver has actually
                started the trip, cancelling stops being the right action;
                this screen only ever exists once a trip is at least
                trackable, so 'scheduled' here just means the rider got
                here before the driver started (e.g. via the old
                pending -> pickup -> live chain). */}
            {!trip || trip.status === 'scheduled' ? (
              <Button
                theme={theme}
                label={t('activeTrip:cancel')}
                variant="ghost"
                size="sm"
                onPress={() => setCancelling(true)}
              />
            ) : null}
          </View>
        ) : null}
        </Reanimated.View>
      </GestureDetector>

      {params.bookingId ? (
        <>
          <CancellationSheet
            visible={cancelling}
            bookingId={params.bookingId}
            role="rider"
            onClose={() => setCancelling(false)}
            onCancelled={() => router.replace('/(tabs)/trips')}
          />
          <NoShowReportSheet
            visible={reportingNoShow}
            bookingId={params.bookingId}
            role="rider"
            counterpartName={driverName}
            onClose={() => setReportingNoShow(false)}
            onReported={() => router.replace('/(tabs)/trips')}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  map: {
    borderRadius: 0,
    flex: 1,
  },
  floatingBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    // Anchored above the sheet's collapsed peek height, not just
    // spacing.md — the sheet is now an absolutely-positioned overlay on
    // top of the full-screen map (draggable), not a flex sibling below it,
    // so a fixed small offset would sit underneath it.
    bottom: PEEK_HEIGHT + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.sm,
  },
  floatingBannerText: {
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  driverPuck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tripActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  loading: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  errorText: {
    marginTop: spacing.xs,
  },
});
