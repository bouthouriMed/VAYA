import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router, useLocalSearchParams } from 'expo-router';
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
  useGetRideQuery,
  useGetRideStopsQuery,
  useListRequestsForRideQuery,
  useAcceptBookingMutation,
  useDeclineBookingMutation,
  type Booking,
  type Ride,
} from '../../../src/state/api';
import { decodePolyline } from '../../../src/utils/polyline';
import { DriverBookingDetailSheet } from '../../../src/features/driver-rides/DriverBookingDetailSheet';
import { ManageRideSheet } from '../../../src/features/driver-rides/ManageRideSheet';
import { trackEvent } from '../../../src/services/analytics/analytics';
import { estimateArrivalLabel } from '../../../src/features/driver-rides/myRidesHelpers';
import { RouteTimeline } from '../../../src/features/trip-shared/RouteTimeline';

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return `Aujourd'hui, ${time}`;
  return `${date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

/** One pending request row — real passenger identity, seats, pickup point,
 *  and the same Accepter/Refuser mutations RideRequestsSheet already uses,
 *  now inline in the trip hub rather than tucked in a sheet. */
function PendingRequestRow({
  booking,
  rideDestinationLabel,
  theme,
}: {
  booking: Booking;
  rideDestinationLabel: string;
  theme: ThemeColors;
}): React.JSX.Element {
  const { t } = useTranslation('driver');
  const [acceptBooking, acceptState] = useAcceptBookingMutation();
  const [declineBooking, declineState] = useDeclineBookingMutation();
  const [error, setError] = useState<string | null>(null);
  const isBusy = acceptState.isLoading || declineState.isLoading;

  async function respond(action: 'accept' | 'decline'): Promise<void> {
    setError(null);
    try {
      if (action === 'accept') await acceptBooking(booking.id).unwrap();
      else await declineBooking(booking.id).unwrap();
      haptics.success();
      trackEvent('driver_request_response', { action, source: 'ride-hub' });
    } catch {
      haptics.error();
      setError(action === 'accept' ? t('rides.requestsSheet.acceptError') : t('rides.requestsSheet.declineError'));
    }
  }

  return (
    <View style={[styles.glassRow, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}>
      <View style={styles.requestIdentityRow}>
        <Avatar
          uri={booking.rider?.avatarUrl}
          name={booking.rider?.fullName ?? '?'}
          sizePx={40}
          fallbackBackgroundColor={theme.surface}
          fallbackTextColor={theme.ink}
        />
        <View style={styles.requestIdentityText}>
          <Text variant="body" color={theme.ink} numberOfLines={1}>
            {booking.rider?.fullName ?? t('rides.rideDetail.passenger')}
          </Text>
          <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
            {`${booking.seatsRequested} place${booking.seatsRequested > 1 ? 's' : ''} · ${booking.pickupLabel}`}
          </Text>
          {/* This passenger's own dropoff — may not match the ride's own
           *  destination on a route-passthrough match, so the driver sees
           *  exactly where THIS rider goes before deciding, not just where
           *  the ride itself ends. */}
          <Text variant="caption" color={theme.inkFaint} numberOfLines={1}>
            {`→ ${booking.dropoffLabel ?? rideDestinationLabel}`}
          </Text>
        </View>
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity
          style={[styles.pillButton, styles.pillButtonOutline, { borderColor: theme.outline }]}
          onPress={() => void respond('decline')}
          disabled={isBusy}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${t('rides.requestsSheet.decline')} ${booking.rider?.fullName ?? ''}`}
        >
          <Text variant="label" color={theme.error}>
            {t('rides.requestsSheet.decline')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pillButton, { backgroundColor: theme.accent }]}
          onPress={() => void respond('accept')}
          disabled={isBusy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${t('rides.requestsSheet.accept')} ${booking.rider?.fullName ?? ''}`}
        >
          <Text variant="label" color={theme.onAccent}>
            {t('rides.requestsSheet.accept')}
          </Text>
        </TouchableOpacity>
      </View>
      {error ? (
        <Text variant="caption" color={theme.error} style={styles.requestError}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Driver's real-time ride management hub (2026-08-23 trips/notifications
 * redesign) — consolidates what RideRequestsSheet + ManageRideSheet used to
 * split across two separate bottom sheets into one screen: a real route
 * preview, the ride's own facts, a glassmorphic passenger list with inline
 * accept/decline on pending requests, and a sticky "Annuler le trajet"
 * footer. Tapping an already-answered row still opens
 * DriverBookingDetailSheet (message/no-show/cancel-this-booking) — reused
 * as-is, not rebuilt.
 */
export default function DriverRideHubScreen(): React.JSX.Element {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const insets = useSafeAreaInsets();
  const { colors: theme, scheme } = useAppTheme();
  const { t } = useTranslation(['driver', 'booking', 'common']);
  const [managedBooking, setManagedBooking] = useState<Booking | null>(null);

  const RIDE_BADGE: Record<Ride['status'], { label: string; variant: 'default' | 'success' | 'info' | 'warning' | 'error' }> = {
    draft: { label: t('rides.rideDetail.departure'), variant: 'default' },
    published: { label: t('rides.rideDetail.departure'), variant: 'success' },
    full: { label: t('rides.rideDetail.departure'), variant: 'info' },
    in_progress: { label: t('rides.rideDetail.departure'), variant: 'warning' },
    completed: { label: t('rides.rideDetail.arrival'), variant: 'info' },
    cancelled: { label: t('rides.rideDetail.cancelRide'), variant: 'error' },
  };

  const ANSWERED_BADGE: Record<Booking['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'error' }> = {
    pending: { label: t('rides.requestsSheet.sectionPending'), variant: 'warning' },
    accepted: { label: t('rides.requestsSheet.sectionAccepted'), variant: 'success' },
    declined: { label: t('rides.requestsSheet.decline'), variant: 'error' },
    cancelled_by_rider: { label: t('rides.rideDetail.cancelRide'), variant: 'default' },
    cancelled_by_driver: { label: t('rides.rideDetail.cancelRide'), variant: 'error' },
    expired: { label: t('rides.requestsSheet.empty'), variant: 'default' },
    completed: { label: t('rides.rideDetail.arrival'), variant: 'default' },
    no_show: { label: t('rides.requestsSheet.empty'), variant: 'error' },
  };
  const [cancellingRide, setCancellingRide] = useState(false);
  const [routeModalOpen, setRouteModalOpen] = useState(false);

  const { data: ride, isLoading: isRideLoading } = useGetRideQuery(rideId);
  const { data: requests, isLoading: isRequestsLoading } = useListRequestsForRideQuery(rideId);
  const { data: stops } = useGetRideStopsQuery(rideId);

  const pending = (requests ?? []).filter((r) => r.status === 'pending');
  const answered = (requests ?? []).filter((r) => r.status !== 'pending');
  const routeCoordinates = ride?.routePolyline ? decodePolyline(ride.routePolyline) : [];
  // Only the driver-selected stops (the endpoint already filters to these —
  // see getRideStops's own comment), in route order. The publish flow
  // confirms exactly a pickup then a dropoff, so 2 real stops is the normal
  // case; older rides published before that flow existed may have more (or
  // none, if the driver picked no additional stops at all — a valid ride,
  // nothing to show here then).
  const selectedStops = [...(stops ?? [])].sort((a, b) => a.sequence - b.sequence);
  const arrivalLabel = ride ? estimateArrivalLabel(ride.departureAt, ride.estimatedDurationSec) : null;
  // The map's premium pickup/dropoff pins only make sense for the normal
  // exactly-2-stops shape (same rule the "Points de rendez-vous" section
  // below uses for role labels) — anything else falls back to MapPreview's
  // plain origin/destination dots rather than guessing which of >2 stops
  // is "the" pickup or dropoff.
  const pickupStop = selectedStops.length === 2 ? selectedStops[0] : undefined;
  const dropoffStop = selectedStops.length === 2 ? selectedStops[1] : undefined;
  // Any stop that isn't the pickup or dropoff endpoint — only possible on a
  // legacy ride published before this flow narrowed the driver to exactly
  // one pickup + one dropoff. Shown as neutral waypoints on the fullscreen
  // map, same convention as the passenger's ride-details.tsx.
  const intermediateStops = selectedStops.slice(1, -1);

  if (isRideLoading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <Text variant="body" color={theme.inkFaint}>
          {t('rides.rideDetail.rideNotFound')}
        </Text>
      </View>
    );
  }

  const badge = RIDE_BADGE[ride.status];
  const cancellable = ['draft', 'published', 'full'].includes(ride.status);
  // One connected route timeline — origin, then every driver-selected stop
  // in route order, then destination — instead of the origin/destination
  // pair living in the info card's title while stops sat in a disconnected
  // "Points de rendez-vous" section further down the page. Endpoints
  // (origin/destination) get the same accent/ink solid-dot treatment the
  // map pins already use; stops in between get a quieter hollow dot.
  const timelineEntries: {
    key: string;
    roleLabel: string;
    placeLabel: string;
    isEndpoint: boolean;
  }[] = [
    { key: 'origin', roleLabel: t('rides.rideDetail.departure'), placeLabel: ride.originLabel, isEndpoint: true },
    ...selectedStops.map((stop, index) => ({
      key: stop.id,
      roleLabel:
        selectedStops.length === 2
          ? index === 0
            ? t('rides.rideDetail.dropoff')
            : t('rides.rideDetail.dropoff')
          : `${t('rides.rideDetail.dropoff')} ${index + 1}`,
      placeLabel: stop.label,
      isEndpoint: false,
    })),
    { key: 'destination', roleLabel: t('rides.rideDetail.arrival'), placeLabel: ride.destinationLabel, isEndpoint: true },
  ];
  // Real revenue insight for the driver — summed from actually-accepted
  // bookings' own contributionTotal (which already accounts for seat count),
  // never seatsTotal × price, so a partially-filled ride never overstates
  // what's actually confirmed.
  const confirmedBookings = answered.filter((b) => b.status === 'accepted');
  const confirmedRevenue = confirmedBookings.reduce((sum, b) => sum + b.contributionTotal, 0);
  const fullRouteRegion =
    regionForPoints([
      pickupStop ?? { lat: ride.originLat, lng: ride.originLng },
      ...intermediateStops,
      dropoffStop ?? { lat: ride.destinationLat, lng: ride.destinationLng },
    ]) ?? undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/trips'))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('rides.rideDetail.back')}
          >
            <Ionicons name="chevron-back" size={24} color={theme.ink} />
          </TouchableOpacity>
          <Text variant="h3" color={theme.ink} style={styles.headerTitle}>
            {t('rides.rideDetail.myRide')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.mapCard}>
          <MapPreview
            height={160}
            badge={badge.label}
            origin={{ latitude: ride.originLat, longitude: ride.originLng }}
            destination={{ latitude: ride.destinationLat, longitude: ride.destinationLng }}
            pickup={pickupStop ? { latitude: pickupStop.lat, longitude: pickupStop.lng } : undefined}
            dropoff={dropoffStop ? { latitude: dropoffStop.lat, longitude: dropoffStop.lng } : undefined}
            theme={theme}
            isDark={scheme === 'dark'}
            routeCoordinates={routeCoordinates}
            style={styles.map}
          />
          {/* The preview thumbnail is deliberately non-interactive (same as
           *  every MapPreview elsewhere) — this is the way in to a real,
           *  pannable/zoomable view of the whole route, matching the
           *  passenger's own ride-details.tsx "Voir l'itinéraire" pattern. */}
          <TouchableOpacity
            style={[styles.viewRouteBtn, { backgroundColor: theme.surface }]}
            onPress={() => setRouteModalOpen(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('rides.rideDetail.viewRouteFullscreen')}
          >
            <Icon name="expand-outline" size="xs" color={theme.ink} />
            <Text variant="caption" color={theme.ink}>
              {t('rides.rideDetail.viewRouteFullscreen')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          <View style={styles.infoTitleRow}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              {t('rides.rideDetail.itinerary')}
            </Text>
            <Badge label={badge.label} variant={badge.variant} theme={theme} />
          </View>

          <RouteTimeline entries={timelineEntries} theme={theme} />

          <View style={styles.factRow}>
            <Icon name="time-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {/* Real OSRM/Google-derived duration only — estimateArrivalLabel
               *  returns null (nothing rendered) rather than inventing an
               *  arrival time for a haversine-fallback route. */}
              {arrivalLabel ? `${formatWhen(ride.departureAt)} · ${t('rides.rideDetail.arrivalEta', { time: arrivalLabel })}` : formatWhen(ride.departureAt)}
            </Text>
          </View>
          <View style={styles.factRow}>
            <Icon name="people-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {t('rides.rideDetail.seatsAvailable', { available: ride.seatsAvailable, total: ride.seatsTotal })}
            </Text>
          </View>
          <View style={styles.factRow}>
            <Icon name="cash-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {t('rides.rideDetail.pricePerSeat', { price: ride.contributionPerSeat })}
            </Text>
          </View>
          {confirmedBookings.length > 0 ? (
            <View style={styles.factRow}>
              <Icon name="wallet-outline" size="sm" color={theme.inkMuted} />
              <Text variant="bodySmall" color={theme.inkMuted}>
                {t('rides.rideDetail.confirmedRevenue', { revenue: confirmedRevenue, count: confirmedBookings.length })}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
            {t('rides.rideDetail.pendingSection', { count: pending.length })}
          </Text>
          {isRequestsLoading ? (
            <ActivityIndicator size="small" color={theme.accent} style={styles.loading} />
          ) : pending.length === 0 ? (
            <Text variant="bodySmall" color={theme.inkFaint} style={styles.emptyHint}>
              {t('rides.rideDetail.noPendingRequests')}
            </Text>
          ) : (
            pending.map((booking) => (
              <PendingRequestRow
                key={booking.id}
                booking={booking}
                rideDestinationLabel={ride.destinationLabel}
                theme={theme}
              />
            ))
          )}
        </View>

        {answered.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              {t('rides.rideDetail.passengers')}
            </Text>
            {answered.map((booking) => {
              const meta = ANSWERED_BADGE[booking.status];
              const manageable = booking.status === 'accepted';
              return (
                <TouchableOpacity
                  key={booking.id}
                  style={[styles.glassRow, styles.answeredRow, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}
                  disabled={!manageable}
                  onPress={manageable ? () => setManagedBooking(booking) : undefined}
                  activeOpacity={0.7}
                  accessibilityRole={manageable ? 'button' : undefined}
                  accessibilityLabel={
                    manageable ? `${t('rides.manageSheet.title')} ${booking.rider?.fullName ?? t('rides.bookingDetail.passenger')}` : undefined
                  }
                >
                  <Avatar
                    uri={booking.rider?.avatarUrl}
                    name={booking.rider?.fullName ?? '?'}
                    sizePx={36}
                    fallbackBackgroundColor={theme.surface}
                    fallbackTextColor={theme.ink}
                  />
                  <View style={styles.requestIdentityText}>
                    <Text variant="bodySmall" color={theme.ink} numberOfLines={1}>
                      {booking.rider?.fullName ?? t('rides.bookingDetail.passenger')}
                    </Text>
                    <Text variant="caption" color={theme.inkMuted}>
                      {`${booking.seatsRequested} place${booking.seatsRequested > 1 ? 's' : ''}`}
                    </Text>
                  </View>
                  <Badge label={meta.label} variant={meta.variant} theme={theme} />
                  {manageable ? <Icon name="chevron-forward" size="xs" color={theme.outline} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <View style={styles.scrollSpacer} />
      </ScrollView>

      {cancellable ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, backgroundColor: theme.background, borderTopColor: theme.outlineVariant }]}>
          <Button
            label={t('rides.rideDetail.cancelRide')}
            variant="outline"
            theme={theme}
            onPress={() => setCancellingRide(true)}
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
            <Marker
              coordinate={
                pickupStop
                  ? { latitude: pickupStop.lat, longitude: pickupStop.lng }
                  : { latitude: ride.originLat, longitude: ride.originLng }
              }
              anchor={{ x: 0.5, y: 0.5 }}
            >
              {pickupStop ? (
                <PickupPin theme={theme} />
              ) : (
                <View style={[styles.originDot, { backgroundColor: theme.accent, borderColor: theme.surface }]} />
              )}
            </Marker>
            {intermediateStops.map((stop) => (
              <Marker
                key={stop.id}
                coordinate={{ latitude: stop.lat, longitude: stop.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[styles.waypointDot, { backgroundColor: theme.surface, borderColor: theme.ink }]} />
              </Marker>
            ))}
            <Marker
              coordinate={
                dropoffStop
                  ? { latitude: dropoffStop.lat, longitude: dropoffStop.lng }
                  : { latitude: ride.destinationLat, longitude: ride.destinationLng }
              }
              anchor={{ x: 0.5, y: 0.5 }}
            >
              {dropoffStop ? (
                <DropoffPin theme={theme} />
              ) : (
                <View style={[styles.destDot, { backgroundColor: theme.ink, borderColor: theme.surface }]} />
              )}
            </Marker>
          </MapCanvas>
          <TouchableOpacity
            style={[styles.routeModalClose, { top: insets.top + spacing.sm, backgroundColor: theme.surface }]}
            onPress={() => setRouteModalOpen(false)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('rides.rideDetail.close')}
          >
            <Ionicons name="close" size={22} color={theme.ink} />
          </TouchableOpacity>
        </View>
      </Modal>

      <DriverBookingDetailSheet
        visible={!!managedBooking}
        booking={managedBooking}
        rideDestinationLabel={ride.destinationLabel}
        onClose={() => setManagedBooking(null)}
      />
      <ManageRideSheet
        visible={cancellingRide}
        ride={ride}
        onClose={() => setCancellingRide(false)}
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
  originDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  destDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  waypointDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  infoCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeading: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  loading: {
    marginTop: spacing.sm,
  },
  emptyHint: {
    paddingVertical: spacing.sm,
  },
  glassRow: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  requestIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requestIdentityText: {
    flex: 1,
    gap: 1,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pillButton: {
    flex: 1,
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillButtonOutline: {
    borderWidth: 1,
  },
  requestError: {
    textAlign: 'center',
  },
  answeredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
