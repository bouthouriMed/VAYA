import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Text,
  Icon,
  Avatar,
  Badge,
  Button,
  MapPreview,
  useAppTheme,
  spacing,
  radii,
  haptics,
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

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const RIDE_BADGE: Record<Ride['status'], { label: string; variant: 'default' | 'success' | 'info' | 'warning' | 'error' }> = {
  draft: { label: 'Brouillon', variant: 'default' },
  published: { label: 'Publié', variant: 'success' },
  full: { label: 'Complet', variant: 'info' },
  in_progress: { label: 'En cours', variant: 'warning' },
  completed: { label: 'Terminé', variant: 'info' },
  cancelled: { label: 'Annulé', variant: 'error' },
};

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
  theme,
}: {
  booking: Booking;
  theme: ThemeColors;
}): React.JSX.Element {
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
      setError(action === 'accept' ? "Impossible d'accepter." : 'Impossible de refuser.');
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
            {booking.rider?.fullName ?? 'Passager'}
          </Text>
          <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
            {`${booking.seatsRequested} place${booking.seatsRequested > 1 ? 's' : ''} · ${booking.pickupLabel}`}
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
          accessibilityLabel={`Refuser la demande de ${booking.rider?.fullName ?? 'ce passager'}`}
        >
          <Text variant="label" color={theme.error}>
            Refuser
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pillButton, { backgroundColor: theme.accent }]}
          onPress={() => void respond('accept')}
          disabled={isBusy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Accepter la demande de ${booking.rider?.fullName ?? 'ce passager'}`}
        >
          <Text variant="label" color={theme.onAccent}>
            Accepter
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

const ANSWERED_BADGE: Record<Booking['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'error' }> = {
  pending: { label: 'En attente', variant: 'warning' },
  accepted: { label: 'Confirmé', variant: 'success' },
  declined: { label: 'Refusé', variant: 'error' },
  cancelled_by_rider: { label: 'Annulé', variant: 'default' },
  cancelled_by_driver: { label: 'Annulé', variant: 'error' },
  expired: { label: 'Expiré', variant: 'default' },
  completed: { label: 'Terminé', variant: 'default' },
  no_show: { label: 'Absence', variant: 'error' },
};

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
  const { colors: theme } = useAppTheme();
  const [managedBooking, setManagedBooking] = useState<Booking | null>(null);
  const [cancellingRide, setCancellingRide] = useState(false);

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
          Trajet introuvable.
        </Text>
      </View>
    );
  }

  const badge = RIDE_BADGE[ride.status];
  const cancellable = ['draft', 'published', 'full'].includes(ride.status);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/trips'))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={24} color={theme.ink} />
          </TouchableOpacity>
          <Text variant="h3" color={theme.ink} style={styles.headerTitle}>
            Mon trajet
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <MapPreview
          height={160}
          badge={badge.label}
          origin={{ latitude: ride.originLat, longitude: ride.originLng }}
          destination={{ latitude: ride.destinationLat, longitude: ride.destinationLng }}
          pickup={pickupStop ? { latitude: pickupStop.lat, longitude: pickupStop.lng } : undefined}
          dropoff={dropoffStop ? { latitude: dropoffStop.lat, longitude: dropoffStop.lng } : undefined}
          theme={theme}
          routeCoordinates={routeCoordinates}
          style={styles.map}
        />

        <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          <View style={styles.infoTitleRow}>
            <Text variant="h3" color={theme.ink} style={styles.infoTitle} numberOfLines={2}>
              {`${ride.originLabel} → ${ride.destinationLabel}`}
            </Text>
            <Badge label={badge.label} variant={badge.variant} theme={theme} />
          </View>
          <View style={styles.factRow}>
            <Icon name="time-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {/* Real OSRM/Google-derived duration only — estimateArrivalLabel
               *  returns null (nothing rendered) rather than inventing an
               *  arrival time for a haversine-fallback route. */}
              {arrivalLabel ? `${formatWhen(ride.departureAt)} · Arrivée ~${arrivalLabel}` : formatWhen(ride.departureAt)}
            </Text>
          </View>
          <View style={styles.factRow}>
            <Icon name="people-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {`${ride.seatsAvailable}/${ride.seatsTotal} places disponibles`}
            </Text>
          </View>
          <View style={styles.factRow}>
            <Icon name="cash-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {`${ride.contributionPerSeat} DT par place`}
            </Text>
          </View>
        </View>

        {selectedStops.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              Points de rendez-vous
            </Text>
            <View style={[styles.glassRow, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}>
              {selectedStops.map((stop, index) => {
                const isFirst = index === 0;
                const isLast = index === selectedStops.length - 1;
                // Only the exactly-2-stops case (pickup then dropoff, the
                // shape the current publish flow always produces) gets
                // role labels — an older ride with a different stop count
                // gets a plain sequence number instead of a guessed role.
                const roleLabel =
                  selectedStops.length === 2
                    ? isFirst
                      ? 'Point de rendez-vous'
                      : 'Point de dépose'
                    : `Arrêt ${index + 1}`;
                return (
                  <View
                    key={stop.id}
                    style={!isLast && [styles.stopRow, { borderBottomColor: theme.outlineVariant }]}
                  >
                    <View style={styles.stopRowHeader}>
                      <View
                        style={[
                          styles.stopDot,
                          { backgroundColor: isFirst ? theme.accent : theme.ink, borderColor: theme.surface },
                        ]}
                      />
                      <Text variant="caption" color={theme.inkFaint}>
                        {roleLabel}
                      </Text>
                    </View>
                    <Text variant="bodySmall" color={theme.ink} style={styles.stopLabel}>
                      {stop.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
            {`À répondre (${pending.length})`}
          </Text>
          {isRequestsLoading ? (
            <ActivityIndicator size="small" color={theme.accent} style={styles.loading} />
          ) : pending.length === 0 ? (
            <Text variant="bodySmall" color={theme.inkFaint} style={styles.emptyHint}>
              Aucune demande en attente.
            </Text>
          ) : (
            pending.map((booking) => <PendingRequestRow key={booking.id} booking={booking} theme={theme} />)
          )}
        </View>

        {answered.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              Passagers
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
                    manageable ? `Gérer la réservation de ${booking.rider?.fullName ?? 'ce passager'}` : undefined
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
                      {booking.rider?.fullName ?? 'Passager'}
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
            label="Annuler le trajet"
            variant="outline"
            theme={theme}
            onPress={() => setCancellingRide(true)}
            style={styles.footerButton}
          />
        </View>
      ) : null}

      <DriverBookingDetailSheet
        visible={!!managedBooking}
        booking={managedBooking}
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
  map: {
    marginHorizontal: spacing.lg,
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
  stopRow: {
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  stopRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  stopLabel: {
    marginLeft: spacing.md + spacing.xs,
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
