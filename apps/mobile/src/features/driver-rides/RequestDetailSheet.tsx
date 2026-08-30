import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheet,
  Badge,
  Button,
  Avatar,
  Icon,
  Text,
  MapPreview,
  MapCanvas,
  PickupPin,
  DropoffPin,
  useAppTheme,
  spacing,
  radii,
  haptics,
  regionForPoints,
} from '@vaya/design-system';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import type { SupportedLocale } from '@vaya/config';
import type { Booking, DetourPreviewPoint } from '../../state/api';
import {
  useGetBookingDetourPreviewQuery,
  useAcceptBookingMutation,
  useDeclineBookingMutation,
} from '../../state/api';
import { formatDistance, formatTime } from '../../utils/localeFormat';
import { openInMaps } from '../../utils/openInMaps';
import { trackEvent } from '../../services/analytics/analytics';
import { decodePolyline, sliceRouteBetween } from '../../utils/polyline';

interface RequestDetailSheetProps {
  visible: boolean;
  booking: Booking | null;
  onClose: () => void;
  /** The ride's own real route geometry — this sheet slices it down to
   *  just the requested segment (preview.pickup -> preview.dropoff) for
   *  the map, so the driver sees the specific request's route, not the
   *  ride's full end-to-end line. Absent (e.g. a legacy pre-routing ride)
   *  just skips the map, never a fabricated line. */
  routePolyline?: string | null;
  /** Fired after a real accept/decline succeeds — RideRequestsSheet's list
   *  refetches itself via RTK Query's own tag invalidation, this is purely
   *  so the caller can close the sheet / show its own feedback. */
  onResolved?: (action: 'accepted' | 'declined') => void;
}

function durationLabel(
  seconds: number,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  return t('common:terms.minute', { count: Math.max(1, Math.round(seconds / 60)) });
}

/** One pickup/dropoff row: the point's label, and either an "already on
 *  your route" badge + stop position, or the real live-computed detour this
 *  point would add (only possible for a free-form point on a legacy,
 *  zero-route_stops ride — see bookings.service.ts's previewBookingDetour
 *  doc comment for why the two cases are genuinely different, not just
 *  differently worded). */
function RouteFitRow({
  icon,
  roleLabel,
  timeLabel,
  point,
  t,
  theme,
}: {
  icon: 'navigate-outline' | 'flag-outline';
  roleLabel: string;
  /** Real time the driver would reach this point — direct product
   *  feedback: a distance/duration deviation alone doesn't tell the
   *  driver WHEN they'd meet this passenger. */
  timeLabel: string;
  point: DetourPreviewPoint;
  t: (key: string, params?: Record<string, unknown>) => string;
  theme: ReturnType<typeof useAppTheme>['colors'];
}): React.JSX.Element {
  return (
    <View style={[styles.fitRow, { backgroundColor: theme.surfaceMuted }]}>
      <Icon name={icon} size="sm" color={theme.inkMuted} />
      <View style={styles.fitTextCol}>
        <View style={styles.fitRoleRow}>
          <Text variant="label" color={theme.ink}>
            {timeLabel}
          </Text>
          <Text variant="caption" color={theme.inkFaint}>
            {roleLabel}
          </Text>
        </View>
        <Text variant="bodySmall" color={theme.ink} numberOfLines={2}>
          {point.label}
        </Text>
        {point.isPlannedStop ? (
          <View style={styles.fitBadgeRow}>
            <Badge label={t('driver:rides.requestDetail.onRoute')} variant="success" theme={theme} />
            {point.stopIndex && point.totalStops ? (
              <Text variant="caption" color={theme.inkFaint}>
                {t('driver:rides.requestDetail.stopPosition', {
                  index: point.stopIndex,
                  total: point.totalStops,
                })}
              </Text>
            ) : null}
          </View>
        ) : (
          // Real bug found live: a genuine routing detour (forced through a
          // real waypoint) can legitimately return a real, honest distance
          // delta near/below zero — the alternate path Google finds can be
          // marginally SHORTER while genuinely slower (different road type/
          // speed limits/traffic), never a fabricated number, but "Adds
          // about 0 m · 17 min" reads as self-contradictory. The real
          // accept/reject decision (detourAllowanceSec) is duration-only
          // anyway — distance was never load-bearing here, just confusing.
          <Text variant="caption" color={theme.warning}>
            {t('driver:rides.requestDetail.addsDetour', {
              duration: durationLabel(point.deviationSeconds ?? 0, t),
            })}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => openInMaps(point.lat, point.lng, point.label)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('driver:rides.requestDetail.openInMaps', { label: point.label })}
      >
        <Icon name="map-outline" size="sm" color={theme.inkMuted} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * "Does this request fit my route?" — opened from the small info icon on a
 * pending request row (RideRequestsSheet) or from a driver's booking_
 * requested notification. World-class-carpooling-app table stakes
 * (BlaBlaCar/Uber-style "this adds X min to your trip"): a concise summary
 * of the requested route, how it sits against the driver's own planned
 * stops, the real distance/duration this passenger actually rides with the
 * driver, and — right here, not buried elsewhere — the same Accepter/
 * Refuser actions RideRequestsSheet's row already offers, so a driver who
 * opens this to decide doesn't have to close it and go find the buttons
 * again. Backed by GET /bookings/:id/detour-preview (bookings.service.ts's
 * previewBookingDetour) — a pure, side-effect-free read.
 */
export function RequestDetailSheet({
  visible,
  booking,
  routePolyline,
  onClose,
  onResolved,
}: RequestDetailSheetProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as SupportedLocale;
  const theme = useAppTheme().colors;
  const insets = useSafeAreaInsets();
  const [fullscreenMapOpen, setFullscreenMapOpen] = useState(false);
  const {
    data: preview,
    isFetching,
    isError,
  } = useGetBookingDetourPreviewQuery(booking?.id ?? '', { skip: !visible || !booking?.id });

  // The driver's own real, whole-trip route — never sliced — so the
  // fullscreen view can show it underneath the requested segment for
  // context ("does this fit my planned route?"), not just the isolated
  // leg the compact preview shows.
  const fullRouteCoordinates = useMemo(
    () => (routePolyline ? decodePolyline(routePolyline) : []),
    [routePolyline],
  );

  // This specific request's segment, not the driver's whole route. When
  // either point is a real detour (not on the ride's own routePolyline at
  // all — preview.detourRoutePolyline is only ever populated in that
  // case), slicing the RIDE's route between two points that aren't
  // actually on it would show the wrong line entirely; use the real
  // routing-engine polyline computed for this exact pickup -> dropoff leg
  // instead. Otherwise (both points are planned stops), slicing the ride's
  // own real geometry is already exactly right.
  const segmentCoordinates = useMemo(() => {
    if (!preview) return [];
    const source = preview.detourRoutePolyline ?? routePolyline;
    if (!source) return [];
    const full = decodePolyline(source);
    if (full.length < 2) return full;
    return sliceRouteBetween(
      full,
      { latitude: preview.pickup.lat, longitude: preview.pickup.lng },
      { latitude: preview.dropoff.lat, longitude: preview.dropoff.lng },
    );
  }, [routePolyline, preview]);

  // Fits both the driver's full route AND the requested segment (a
  // route-passthrough/detour request's pickup/dropoff can sit well outside
  // the ride's own endpoints) — never just the segment alone, or the
  // fullscreen view could crop the very context it exists to show.
  const fullscreenRegion = preview
    ? (regionForPoints([
        ...fullRouteCoordinates.map((p) => ({ lat: p.latitude, lng: p.longitude })),
        { lat: preview.pickup.lat, lng: preview.pickup.lng },
        { lat: preview.dropoff.lat, lng: preview.dropoff.lng },
      ]) ?? undefined)
    : undefined;

  const [acceptBooking, acceptState] = useAcceptBookingMutation();
  const [declineBooking, declineState] = useDeclineBookingMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) setActionError(null);
  }, [visible]);

  if (!booking) {
    return (
      <BottomSheet visible={false} onClose={onClose} theme={theme}>
        {null}
      </BottomSheet>
    );
  }

  async function respond(action: 'accept' | 'decline'): Promise<void> {
    setActionError(null);
    try {
      if (action === 'accept') {
        await acceptBooking(booking!.id).unwrap();
      } else {
        await declineBooking(booking!.id).unwrap();
      }
      haptics.success();
      trackEvent('driver_request_response', { action, source: 'request_detail_sheet' });
      onResolved?.(action === 'accept' ? 'accepted' : 'declined');
      onClose();
    } catch {
      haptics.error();
      setActionError(
        action === 'accept'
          ? t('driver:rides.requestsSheet.acceptError')
          : t('driver:rides.requestsSheet.declineError'),
      );
    }
  }

  function viewProfile(): void {
    if (!booking!.rider) return;
    haptics.selection();
    onClose();
    // bookingId lets trust.tsx check for a real conversation (Phase 8:
    // created only once this booking reaches `accepted`) and enable a real
    // Message button instead of always showing it disabled.
    router.push({
      pathname: '/search/trust',
      params: { driverUserId: booking!.riderId, bookingId: booking!.id },
    });
  }

  const isBusy = acceptState.isLoading || declineState.isLoading;

  return (
    <>
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('driver:rides.requestDetail.title')}
      heightRatio={0.72}
      theme={theme}
      bottomInset={insets.bottom}
    >
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.identityRow}
          onPress={viewProfile}
          disabled={!booking.rider}
          accessibilityRole={booking.rider ? 'button' : undefined}
          accessibilityLabel={
            booking.rider
              ? t('driver:rides.requestDetail.viewProfile', { name: booking.rider.fullName })
              : undefined
          }
        >
          <Avatar
            uri={booking.rider?.avatarUrl}
            name={booking.rider?.fullName ?? '?'}
            sizePx={48}
          />
          <View style={styles.identityText}>
            <Text variant="body" color={theme.ink} style={styles.riderName} numberOfLines={1}>
              {booking.rider?.fullName ?? t('booking:passenger')}
            </Text>
            <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
              {t('driver:rides.bookingDetail.seatsAndPrice', {
                seatLabel: t('common:terms.seat', { count: booking.seatsRequested }),
                price: booking.contributionTotal,
              })}
            </Text>
          </View>
          {booking.rider ? <Icon name="chevron-forward" size="sm" color={theme.inkFaint} /> : null}
        </TouchableOpacity>

        {/* M-054/M-061 (docs/unified_driver_and_passenger_journey.md §20/§22):
         *  the real, server-authoritative response deadline
         *  (bookings.service.ts's createBooking) — was entirely absent from
         *  this sheet before, even though the field already existed on
         *  `booking`. Shown only for a still-pending request; an
         *  accepted/declined booking has already been responded to. */}
        {booking.status === 'pending' && booking.expiresAt ? (
          <View style={[styles.segmentRow, { borderColor: theme.outlineVariant }]}>
            <Icon name="hourglass-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.ink}>
              {t('driver:rides.requestDetail.respondBy', {
                time: formatTime(new Date(booking.expiresAt), locale),
              })}
            </Text>
          </View>
        ) : null}

        {isFetching ? (
          <ActivityIndicator size="small" color={theme.accent} style={styles.loading} />
        ) : isError || !preview ? (
          <Text variant="bodySmall" color={theme.error}>
            {t('driver:rides.requestDetail.loadError')}
          </Text>
        ) : (
          <>
            {/* Tappable + explicitly labeled expand affordance (same
             *  pattern driver/rides/[rideId].tsx's own route preview uses)
             *  — opens a real pannable/zoomable view of the driver's whole
             *  route with this request's segment overlaid on top, not just
             *  the isolated compact preview. */}
            <TouchableOpacity
              style={styles.mapWrap}
              activeOpacity={0.85}
              onPress={() => setFullscreenMapOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('driver:rides.rideDetail.viewRouteFullscreen')}
            >
              <MapPreview
                height={120}
                pickup={{ latitude: preview.pickup.lat, longitude: preview.pickup.lng }}
                dropoff={{ latitude: preview.dropoff.lat, longitude: preview.dropoff.lng }}
                theme={theme}
                routeCoordinates={segmentCoordinates}
                style={styles.map}
              />
              <View style={[styles.expandBtn, { backgroundColor: theme.surface }]}>
                <Icon name="expand-outline" size="xs" color={theme.ink} />
                <Text variant="caption" color={theme.ink}>
                  {t('driver:rides.rideDetail.viewRouteFullscreen')}
                </Text>
              </View>
            </TouchableOpacity>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionLabel}>
              {t('driver:rides.requestDetail.routeFit')}
            </Text>
            <RouteFitRow
              icon="navigate-outline"
              roleLabel={t('common:terms.pickup')}
              timeLabel={formatTime(new Date(preview.pickupTime), locale)}
              point={preview.pickup}
              t={t}
              theme={theme}
            />
            <RouteFitRow
              icon="flag-outline"
              roleLabel={t('common:terms.dropoff')}
              timeLabel={formatTime(new Date(preview.dropoffTime), locale)}
              point={preview.dropoff}
              t={t}
              theme={theme}
            />
            {preview.pickup.isPlannedStop === false || preview.dropoff.isPlannedStop === false ? (
              preview.segment.isEstimate ? (
                <Text variant="caption" color={theme.inkFaint}>
                  {t('driver:rides.requestDetail.estimateNote')}
                </Text>
              ) : null
            ) : null}

            <View style={[styles.segmentRow, { borderColor: theme.outlineVariant }]}>
              <Icon name="car-sport-outline" size="sm" color={theme.inkMuted} />
              <Text variant="bodySmall" color={theme.ink}>
                {t('driver:rides.requestDetail.ridesWithYou')}
                {': '}
                {t('driver:rides.requestDetail.segmentDistance', {
                  distance: formatDistance(preview.segment.distanceM, locale),
                  duration: durationLabel(preview.segment.durationSec, t),
                })}
              </Text>
            </View>

            {/* The driver's OWN updated trip-completion time if they accept
             *  this request — distinct from the passenger's own dropoff row
             *  above. Direct product feedback: the driver needs to see how
             *  accepting shifts their own schedule, not just the
             *  passenger's. */}
            <View style={[styles.segmentRow, { borderColor: theme.outlineVariant }]}>
              <Icon name="time-outline" size="sm" color={theme.inkMuted} />
              <Text variant="bodySmall" color={theme.ink}>
                {t('driver:rides.requestDetail.newEta', { time: formatTime(new Date(preview.newEta), locale) })}
              </Text>
            </View>
          </>
        )}

        {actionError ? (
          <Text variant="bodySmall" color={theme.error} style={styles.actionErrorText}>
            {actionError}
          </Text>
        ) : null}

        <View style={styles.actionBar}>
          <Button
            label={t('common:actions.decline')}
            variant="outline"
            theme={theme}
            disabled={isBusy}
            onPress={() => void respond('decline')}
            style={styles.actionButton}
          />
          <Button
            label={t('common:actions.accept')}
            theme={theme}
            disabled={isBusy}
            loading={acceptState.isLoading}
            onPress={() => void respond('accept')}
            style={styles.actionButton}
          />
        </View>
      </View>
    </BottomSheet>

    {/* Fullscreen route view — the driver's whole real route (muted, thin)
     *  with this specific request's segment overlaid on top (accent,
     *  thick), so "does this fit my route?" is answerable at a glance
     *  instead of guessing from the 120px compact preview. Same Modal +
     *  MapCanvas + Polyline/Marker pattern driver/rides/[rideId].tsx's own
     *  "view route fullscreen" already establishes, not a new one. */}
    <Modal visible={fullscreenMapOpen} animationType="slide" onRequestClose={() => setFullscreenMapOpen(false)}>
      <View style={[styles.routeModal, { backgroundColor: theme.background }]}>
        {preview ? (
          <MapCanvas region={fullscreenRegion} style={styles.routeModalMap}>
            {fullRouteCoordinates.length > 1 ? (
              <Polyline coordinates={fullRouteCoordinates} strokeColor={theme.outline} strokeWidth={4} />
            ) : null}
            {segmentCoordinates.length > 1 ? (
              <Polyline
                coordinates={segmentCoordinates}
                strokeColor={theme.accent}
                strokeWidth={6}
                zIndex={10}
              />
            ) : null}
            <Marker
              coordinate={{ latitude: preview.pickup.lat, longitude: preview.pickup.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={20}
            >
              <PickupPin theme={theme} />
            </Marker>
            <Marker
              coordinate={{ latitude: preview.dropoff.lat, longitude: preview.dropoff.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={20}
            >
              <DropoffPin theme={theme} />
            </Marker>
          </MapCanvas>
        ) : null}

        {/* Legend — the whole point of overlaying two lines is lost if a
         *  driver can't tell which is which at a glance. */}
        <View style={[styles.legend, { top: insets.top + spacing.sm, backgroundColor: theme.surface }]}>
          <View style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: theme.outline }]} />
            <Text variant="caption" color={theme.ink}>
              {t('driver:rides.requestDetail.yourRoute')}
            </Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendSwatch, styles.legendSwatchThick, { backgroundColor: theme.accent }]} />
            <Text variant="caption" color={theme.ink}>
              {t('driver:rides.requestDetail.thisRequest')}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.routeModalClose, { top: insets.top + spacing.sm, backgroundColor: theme.surface }]}
          onPress={() => setFullscreenMapOpen(false)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('driver:rides.rideDetail.close')}
        >
          <Ionicons name="close" size={22} color={theme.ink} />
        </TouchableOpacity>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  map: {
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  mapWrap: {
    position: 'relative',
  },
  expandBtn: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  routeModal: {
    flex: 1,
  },
  routeModalMap: {
    flex: 1,
  },
  routeModalClose: {
    position: 'absolute',
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  legend: {
    position: 'absolute',
    left: spacing.lg,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 16,
    height: 3,
    borderRadius: radii.full,
  },
  legendSwatchThick: {
    height: 4,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  identityText: {
    flex: 1,
    gap: 1,
  },
  riderName: {
    fontWeight: '600',
  },
  loading: {
    marginVertical: spacing.lg,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.xs,
  },
  fitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  fitTextCol: {
    flex: 1,
    gap: 2,
  },
  fitRoleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  fitBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  actionErrorText: {
    textAlign: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionButton: {
    flex: 1,
  },
});
