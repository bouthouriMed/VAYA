import { useMemo, useState } from 'react';
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
import { useListMyBookingsQuery, useGetRideQuery, useGetUserPublicProfileQuery, type Booking } from '../../src/state/api';
import { decodePolyline } from '../../src/utils/polyline';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';
import { trackEvent } from '../../src/services/analytics/analytics';

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const BOOKING_BADGE: Record<Booking['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  pending: { label: 'En attente', variant: 'warning' },
  accepted: { label: 'Confirmé', variant: 'success' },
  declined: { label: 'Refusé', variant: 'error' },
  cancelled_by_rider: { label: 'Annulé', variant: 'default' },
  cancelled_by_driver: { label: 'Annulé par le conducteur', variant: 'error' },
  expired: { label: 'Expiré', variant: 'default' },
  completed: { label: 'Terminé', variant: 'info' },
  no_show: { label: 'Absence', variant: 'error' },
};

const CANCELLABLE_STATUSES: Booking['status'][] = ['pending', 'accepted'];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return `Aujourd'hui, ${time}`;
  return `${date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

function DriverCard({
  theme,
  fullName,
  avatarUrl,
  ratingAvg,
  onOpenConversation,
}: {
  theme: ThemeColors;
  fullName: string;
  avatarUrl: string | null;
  ratingAvg?: number;
  onOpenConversation: () => void;
}): React.JSX.Element {
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
            </View>
          ) : (
            <Text variant="caption" color={theme.inkFaint}>
              Nouveau sur VAYA
            </Text>
          )}
        </View>
      </View>
      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          style={[styles.quickAction, { backgroundColor: theme.surfaceMuted }]}
          onPress={onOpenConversation}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Envoyer un message"
        >
          <Icon name="chatbubble-outline" size="sm" color={theme.ink} />
          <Text variant="bodySmall" color={theme.ink}>
            Message
          </Text>
        </TouchableOpacity>
        {/* No phone number is ever exposed via the public API (search/
            ride-details.tsx's own precedent) — rendered disabled with an
            honest reason rather than a dead tap. */}
        <View style={[styles.quickAction, styles.quickActionDisabled, { backgroundColor: theme.surfaceMuted }]}>
          <Icon name="call-outline" size="sm" color={theme.inkFaint} />
          <Text variant="bodySmall" color={theme.inkFaint}>
            Appeler
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
 * candidate: real driver public profile (rating, vehicle) resolved from
 * `booking.ride.driverUserId` (Phase-13-era addition to listMyBookings),
 * a sticky "Annuler ma réservation" footer instead of "Demander une place".
 * The specific booking is read from the already-cached listMyBookings
 * result — no new single-booking endpoint needed.
 */
export default function BookingDetailScreen(): React.JSX.Element {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const [cancelling, setCancelling] = useState(false);

  const { data: bookings, isLoading: isBookingsLoading } = useListMyBookingsQuery();
  const booking = useMemo(() => bookings?.find((b) => b.id === bookingId), [bookings, bookingId]);

  const { data: ride, isLoading: isRideLoading } = useGetRideQuery(booking?.rideId ?? '', {
    skip: !booking,
  });
  const { data: driverProfile } = useGetUserPublicProfileQuery(booking?.ride?.driverUserId ?? '', {
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

  if (!booking || !booking.ride) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <Text variant="body" color={theme.inkFaint}>
          Réservation introuvable.
        </Text>
      </View>
    );
  }

  const badge = BOOKING_BADGE[booking.status];
  const cancellable = CANCELLABLE_STATUSES.includes(booking.status);

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
            Ma réservation
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {ride ? (
          <MapPreview
            height={160}
            badge={badge.label}
            origin={{ latitude: ride.originLat, longitude: ride.originLng }}
            destination={{ latitude: ride.destinationLat, longitude: ride.destinationLng }}
            routeCoordinates={routeCoordinates}
            style={styles.map}
          />
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          <View style={styles.infoTitleRow}>
            <Text variant="h3" color={theme.ink} style={styles.infoTitle} numberOfLines={2}>
              {`${booking.ride.originLabel} → ${booking.ride.destinationLabel}`}
            </Text>
            <Badge label={badge.label} variant={badge.variant} theme={theme} />
          </View>
          <View style={styles.factRow}>
            <Icon name="time-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {formatWhen(booking.ride.departureAt)}
            </Text>
          </View>
          <View style={styles.factRow}>
            <Icon name="location-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={2} style={styles.factTextFlex}>
              {booking.pickupLabel}
            </Text>
          </View>
          <View style={styles.factRow}>
            <Icon name="cash-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {`${booking.contributionTotal} DT · ${booking.seatsRequested} place${booking.seatsRequested > 1 ? 's' : ''}`}
            </Text>
          </View>
        </View>

        <DriverCard
          theme={theme}
          fullName={driverProfile?.fullName ?? booking.ride.driverFullName ?? 'Conducteur'}
          avatarUrl={driverProfile?.avatarUrl ?? null}
          ratingAvg={driverProfile?.driver?.ratingAvg}
          onOpenConversation={openConversation}
        />

        {driverProfile?.driver?.vehicle ? (
          <View style={[styles.card, styles.vehicleCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <View style={[styles.vehicleIcon, { backgroundColor: theme.surfaceMuted }]}>
              <Icon name="car-sport-outline" size="md" color={theme.inkMuted} />
            </View>
            <View>
              <Text variant="label" color={theme.ink}>
                Véhicule
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
            label="Annuler ma réservation"
            variant="outline"
            theme={theme}
            onPress={() => setCancelling(true)}
            style={styles.footerButton}
          />
        </View>
      ) : null}

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
  map: {
    marginHorizontal: spacing.lg,
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
  factTextFlex: {
    flex: 1,
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
