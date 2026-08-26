import { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '@vaya/config';
import {
  Text,
  Icon,
  Avatar,
  Badge,
  Button,
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
import {
  useListMyBookingsQuery,
  useGetRideQuery,
  useGetUserPublicProfileQuery,
  useGetUserTrustSummaryQuery,
  type Booking,
  type TrustTier,
} from '../../src/state/api';
import { decodePolyline, estimateWalkMinutes, haversineKm } from '../../src/utils/polyline';
import { formatDate, formatTime, formatDistance, formatCurrency } from '../../src/utils/localeFormat';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';
import { trackEvent } from '../../src/services/analytics/analytics';
import { trustTierBadge } from '../../src/features/ratings/ratingHelpers';
import { useCurrentPosition } from '../../src/services/location/useCurrentPosition';
import { RouteTimeline, type RouteTimelineEntry } from '../../src/features/trip-shared/RouteTimeline';

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];
type TFn = (key: string, options?: Record<string, unknown>) => string;

const BOOKING_BADGE_KEY: Record<Booking['status'], { key: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  pending: { key: 'booking:status_pending', variant: 'warning' },
  accepted: { key: 'booking:status_accepted', variant: 'success' },
  declined: { key: 'booking:status_declined', variant: 'error' },
  cancelled_by_rider: { key: 'booking:status_cancelled_by_rider', variant: 'default' },
  cancelled_by_driver: { key: 'booking:status_cancelled_by_driver', variant: 'error' },
  expired: { key: 'booking:status_expired', variant: 'default' },
  completed: { key: 'booking:status_completed', variant: 'info' },
  no_show: { key: 'booking:status_no_show', variant: 'error' },
};

function getBookingBadge(t: TFn, status: Booking['status']): { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' } {
  const { key, variant } = BOOKING_BADGE_KEY[status];
  return { label: t(key), variant };
}

const CANCELLABLE_STATUSES: Booking['status'][] = ['pending', 'accepted'];
// Only an upcoming, still-live booking has a meaningful "distance to
// pickup right now" — showing it on a completed/cancelled booking would be
// either stale or meaningless.
const LIVE_DISTANCE_STATUSES: Booking['status'][] = ['pending', 'accepted'];

function formatWhen(iso: string, t: TFn, locale: SupportedLocale): string {
  const date = new Date(iso);
  const isToday = date.toDateString() === new Date().toDateString();
  const time = formatTime(date, locale);
  if (isToday) return `${t('common:time.today')}, ${time}`;
  return `${formatDate(date, locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

function DriverCard({
  theme,
  t,
  fullName,
  avatarUrl,
  ratingAvg,
  tripCount,
  trustTier,
  onOpenConversation,
}: {
  theme: ThemeColors;
  t: TFn;
  fullName: string;
  avatarUrl: string | null;
  ratingAvg?: number;
  tripCount?: number;
  trustTier?: TrustTier;
  onOpenConversation: () => void;
}): React.JSX.Element {
  const tierMeta = trustTier ? trustTierBadge(trustTier) : null;
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
      <View style={styles.driverRow}>
        <Avatar
          uri={avatarUrl}
          name={fullName}
          sizePx={52}
          fallbackBackgroundColor={theme.surfaceMuted}
          fallbackTextColor={theme.ink}
        />
        <View style={styles.driverText}>
          <Text variant="label" color={theme.ink} numberOfLines={1}>
            {fullName}
          </Text>
          {ratingAvg ? (
            <View style={styles.ratingRow}>
              <Icon name="star" size="xs" color={theme.accent} />
              <Text variant="caption" color={theme.inkMuted}>
                {ratingAvg.toFixed(1)}
              </Text>
              {tripCount ? (
                <Text variant="caption" color={theme.inkFaint}>
                  {t('booking:detail.tripsSuffix', { count: tripCount })}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text variant="caption" color={theme.inkFaint}>
              {t('booking:detail.newOnVaya')}
            </Text>
          )}
        </View>
        {tierMeta ? <Badge label={tierMeta.label} variant={tierMeta.variant} theme={theme} /> : null}
      </View>
      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          style={[styles.quickAction, { backgroundColor: theme.surfaceMuted }]}
          onPress={onOpenConversation}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('booking:detail.sendMessage')}
        >
          <Icon name="chatbubble-outline" size="sm" color={theme.ink} />
          <Text variant="bodySmall" color={theme.ink}>
            {t('common:actions.message')}
          </Text>
        </TouchableOpacity>
        {/* No phone number is ever exposed via the public API (search/
            ride-details.tsx's own precedent) — rendered disabled with an
            honest reason rather than a dead tap. */}
        <View style={[styles.quickAction, styles.quickActionDisabled, { backgroundColor: theme.surfaceMuted }]}>
          <Icon name="call-outline" size="sm" color={theme.inkFaint} />
          <Text variant="bodySmall" color={theme.inkFaint}>
            {t('common:actions.call')}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The passenger's own booking — post-request trip hub (2026-08-23 redesign),
 * reusing search/ride-details.tsx's visual language (map header, driver
 * card, timeline) but for viewing an *existing* booking instead of a search
 * candidate: real driver public profile (rating, vehicle, trust tier)
 * resolved from `booking.ride.driverUserId`, a sticky "Annuler ma
 * réservation" footer instead of "Demander une place". The specific booking
 * is read from the already-cached listMyBookings result — no new
 * single-booking endpoint needed.
 *
 * Route display shares RouteTimeline with the driver's own trip hub
 * (driver/rides/[rideId].tsx) so "Point de rendez-vous"/"Point de dépose"
 * mean the same thing on both sides of the same booking — this screen shows
 * THIS passenger's actual pickup/dropoff (booking.pickupLabel/dropoffLabel),
 * which on a route-passthrough match can differ from the ride's own default
 * stops the driver's card highlights.
 *
 * The map is a real, tappable way into a fullscreen route view (mirroring
 * the driver's "Voir l'itinéraire" pattern) instead of a flat, dead
 * thumbnail — and while a booking is still upcoming, a live "distance to
 * pickup" is computed from the device's current position (never a fabricated
 * or search-time-stale figure, since a booking doesn't persist the
 * passenger's original search origin) at the same walk pace the server uses
 * everywhere else (utils/polyline.ts's estimateWalkMinutes).
 */
export default function BookingDetailScreen(): React.JSX.Element {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const { t, i18n } = useTranslation(['booking', 'common']);
  const locale = i18n.language as SupportedLocale;
  const [cancelling, setCancelling] = useState(false);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const { position } = useCurrentPosition();

  const { data: bookings, isLoading: isBookingsLoading } = useListMyBookingsQuery();
  const booking = useMemo(() => bookings?.find((b) => b.id === bookingId), [bookings, bookingId]);

  const { data: ride, isLoading: isRideLoading } = useGetRideQuery(booking?.rideId ?? '', {
    skip: !booking,
  });
  const { data: driverProfile } = useGetUserPublicProfileQuery(booking?.ride?.driverUserId ?? '', {
    skip: !booking?.ride?.driverUserId,
  });
  const { data: trustSummary } = useGetUserTrustSummaryQuery(booking?.ride?.driverUserId ?? '', {
    skip: !booking?.ride?.driverUserId,
  });

  const routeCoordinates = ride?.routePolyline ? decodePolyline(ride.routePolyline) : [];

  function openConversation(): void {
    if (!booking) return;
    haptics.selection();
    router.push(`/conversations/${booking.id}`);
  }

  if (isBookingsLoading || (booking && isRideLoading)) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!booking || !booking.ride || !ride) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <Text variant="body" color={theme.inkFaint}>
          {t('booking:detail.notFound')}
        </Text>
      </View>
    );
  }

  const badge = getBookingBadge(t, booking.status);
  const cancellable = CANCELLABLE_STATUSES.includes(booking.status);
  const dropoffPoint =
    booking.dropoffLat != null && booking.dropoffLng != null
      ? { latitude: booking.dropoffLat, longitude: booking.dropoffLng }
      : { latitude: ride.destinationLat, longitude: ride.destinationLng };
  const hasDropoffStop = booking.dropoffLat != null && booking.dropoffLng != null;

  // This booking's own pickup/dropoff, not just the ride's own endpoints —
  // a route-passthrough match's pickup/dropoff can sit well inside the
  // ride's origin/destination, and the driver's own default stops (shown on
  // driver/rides/[rideId].tsx) may not be exactly this passenger's stops.
  const timelineEntries: RouteTimelineEntry[] = [
    { key: 'origin', roleLabel: t('booking:departure'), placeLabel: booking.ride.originLabel, isEndpoint: true },
    { key: 'pickup', roleLabel: t('booking:detail.pickupPoint'), placeLabel: booking.pickupLabel, isEndpoint: false },
    ...(booking.dropoffLabel
      ? [{ key: 'dropoff', roleLabel: t('booking:detail.dropoffPoint'), placeLabel: booking.dropoffLabel, isEndpoint: false }]
      : []),
    { key: 'destination', roleLabel: t('booking:arrival'), placeLabel: booking.ride.destinationLabel, isEndpoint: true },
  ];

  const showLiveDistance = LIVE_DISTANCE_STATUSES.includes(booking.status) && position != null;
  const distanceToPickupKm = position
    ? haversineKm(
        { latitude: position.lat, longitude: position.lng },
        { latitude: booking.pickupLat, longitude: booking.pickupLng },
      )
    : null;
  const walkToPickupMin =
    position != null
      ? Math.max(
          1,
          Math.round(
            estimateWalkMinutes(
              { latitude: position.lat, longitude: position.lng },
              { latitude: booking.pickupLat, longitude: booking.pickupLng },
            ),
          ),
        )
      : null;

  const fullRouteRegion =
    regionForPoints([
      { lat: ride.originLat, lng: ride.originLng },
      { lat: booking.pickupLat, lng: booking.pickupLng },
      { lat: dropoffPoint.latitude, lng: dropoffPoint.longitude },
      { lat: ride.destinationLat, lng: ride.destinationLng },
    ]) ?? undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/trips'))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.back')}
          >
            <Ionicons name="chevron-back" size={24} color={theme.ink} />
          </TouchableOpacity>
          <Text variant="h3" color={theme.ink} style={styles.headerTitle}>
            {t('booking:detail.title')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.mapCard}>
          <MapPreview
            height={160}
            badge={badge.label}
            origin={{ latitude: ride.originLat, longitude: ride.originLng }}
            destination={{ latitude: ride.destinationLat, longitude: ride.destinationLng }}
            pickup={{ latitude: booking.pickupLat, longitude: booking.pickupLng }}
            dropoff={dropoffPoint}
            theme={theme}
            routeCoordinates={routeCoordinates}
            style={styles.map}
          />
          {/* The preview thumbnail is deliberately non-interactive — this is
           *  the way in to a real, pannable/zoomable view of the whole
           *  route, mirroring the driver's own ride hub "Voir l'itinéraire"
           *  pattern so both sides get an equally useful map, not a dead
           *  static image on one side only. */}
          <TouchableOpacity
            style={[styles.viewRouteBtn, { backgroundColor: theme.surface }]}
            onPress={() => setRouteModalOpen(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('booking:detail.viewRouteFullscreen')}
          >
            <Icon name="expand-outline" size="xs" color={theme.ink} />
            <Text variant="caption" color={theme.ink}>
              {t('booking:detail.viewRoute')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          <View style={styles.infoTitleRow}>
            <Text variant="h3" color={theme.ink} style={styles.infoTitle} numberOfLines={2}>
              {`${booking.ride.originLabel} → ${booking.ride.destinationLabel}`}
            </Text>
            <Badge label={badge.label} variant={badge.variant} theme={theme} />
          </View>

          <RouteTimeline entries={timelineEntries} theme={theme} />

          <View style={styles.factRow}>
            <Icon name="time-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {formatWhen(booking.ride.departureAt, t, locale)}
            </Text>
          </View>
          {showLiveDistance && distanceToPickupKm !== null && walkToPickupMin !== null ? (
            <View style={styles.factRow}>
              <Icon name="walk-outline" size="sm" color={theme.inkMuted} />
              <Text variant="bodySmall" color={theme.inkMuted}>
                {t('booking:detail.distanceToPickup', {
                  distance: formatDistance(distanceToPickupKm * 1000, locale),
                  minutes: t('common:terms.minute', { count: walkToPickupMin }),
                })}
              </Text>
            </View>
          ) : null}
          <View style={styles.factRow}>
            <Icon name="cash-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {t('booking:detail.priceAndSeats', {
                price: formatCurrency(booking.contributionTotal, locale),
                seats: t('common:terms.seat', { count: booking.seatsRequested }),
              })}
            </Text>
          </View>
        </View>

        <DriverCard
          theme={theme}
          t={t}
          fullName={driverProfile?.fullName ?? booking.ride.driverFullName ?? t('common:terms.driver')}
          avatarUrl={driverProfile?.avatarUrl ?? null}
          ratingAvg={driverProfile?.driver?.ratingAvg}
          tripCount={driverProfile?.driver?.tripCount}
          trustTier={trustSummary?.driver?.tier}
          onOpenConversation={openConversation}
        />

        {driverProfile?.driver?.vehicle ? (
          <View style={[styles.card, styles.vehicleCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <View style={[styles.vehicleIcon, { backgroundColor: theme.surfaceMuted }]}>
              <Icon name="car-sport-outline" size="md" color={theme.inkMuted} />
            </View>
            <View>
              <Text variant="label" color={theme.ink}>
                {t('common:terms.vehicle')}
              </Text>
              <Text variant="bodySmall" color={theme.inkMuted}>
                {`${driverProfile.driver.vehicle.make} ${driverProfile.driver.vehicle.model} · ${driverProfile.driver.vehicle.color}`}
              </Text>
              <Text variant="caption" color={theme.inkFaint}>
                {driverProfile.driver.vehicle.plateNumber}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.scrollSpacer} />
      </ScrollView>

      {cancellable ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, backgroundColor: theme.background, borderTopColor: theme.outlineVariant }]}>
          <Button
            label={t('booking:cancelBooking')}
            variant="outline"
            theme={theme}
            onPress={() => setCancelling(true)}
            style={styles.footerButton}
          />
        </View>
      ) : null}

      <Modal
        visible={routeModalOpen}
        animationType="slide"
        onRequestClose={() => setRouteModalOpen(false)}
      >
        <View style={[styles.routeModal, { backgroundColor: theme.background }]}>
          <MapCanvas region={fullRouteRegion} style={styles.routeModalMap}>
            {routeCoordinates.length > 1 ? (
              <Polyline coordinates={routeCoordinates} strokeColor={theme.ink} strokeWidth={4} />
            ) : null}
            <Marker coordinate={{ latitude: booking.pickupLat, longitude: booking.pickupLng }} anchor={{ x: 0.5, y: 0.5 }}>
              <PickupPin theme={theme} />
            </Marker>
            <Marker coordinate={dropoffPoint} anchor={{ x: 0.5, y: 0.5 }}>
              {hasDropoffStop ? (
                <DropoffPin theme={theme} />
              ) : (
                <View style={[styles.destDot, { backgroundColor: theme.ink, borderColor: theme.surface }]} />
              )}
            </Marker>
            {position ? (
              <Marker coordinate={{ latitude: position.lat, longitude: position.lng }} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={[styles.youAreHereOuter, { backgroundColor: theme.accent, borderColor: theme.surface }]}>
                  <View style={[styles.youAreHereInner, { backgroundColor: theme.surface }]} />
                </View>
              </Marker>
            ) : null}
          </MapCanvas>
          <TouchableOpacity
            style={[styles.routeModalClose, { top: insets.top + spacing.sm, backgroundColor: theme.surface }]}
            onPress={() => setRouteModalOpen(false)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.close')}
          >
            <Ionicons name="close" size={22} color={theme.ink} />
          </TouchableOpacity>
        </View>
      </Modal>

      <CancellationSheet
        visible={cancelling}
        bookingId={booking.id}
        role="rider"
        onClose={() => setCancelling(false)}
        onCancelled={() => trackEvent('booking_cancelled_from_hub', { bookingId: booking.id })}
      />
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
  scrollContent: {
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 24,
  },
  mapCard: {
    position: 'relative',
    marginHorizontal: spacing.lg,
  },
  map: {},
  viewRouteBtn: {
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
  destDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  youAreHereOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  youAreHereInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  card: {
    marginHorizontal: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  infoTitle: {
    flex: 1,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  driverText: {
    flex: 1,
    gap: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
  },
  quickActionDisabled: {
    opacity: 0.5,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  vehicleIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollSpacer: {
    height: spacing['3xl'],
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: {
    width: '100%',
  },
});
