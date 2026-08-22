import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Badge, colors, spacing, radii, typography } from '@vaya/design-system';
import { router } from 'expo-router';
import {
  useListMyBookingsQuery,
  useListMyRidesQuery,
  useGetMyDriverProfileQuery,
  useCancelRideMutation,
  type Booking,
  type Ride,
} from '../../src/state/api';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const BOOKING_STATUS: Record<Booking['status'], { label: string; variant: BadgeVariant }> = {
  pending: { label: 'En attente', variant: 'warning' },
  accepted: { label: 'Confirmé', variant: 'success' },
  declined: { label: 'Refusé', variant: 'error' },
  cancelled_by_rider: { label: 'Annulé', variant: 'default' },
  cancelled_by_driver: { label: 'Annulé par le conducteur', variant: 'error' },
  expired: { label: 'Expiré', variant: 'default' },
  completed: { label: 'Terminé', variant: 'info' },
  no_show: { label: 'Absence', variant: 'error' },
};

const RIDE_STATUS: Record<Ride['status'], { label: string; variant: BadgeVariant }> = {
  draft: { label: 'Brouillon', variant: 'default' },
  published: { label: 'Publié', variant: 'success' },
  full: { label: 'Complet', variant: 'info' },
  in_progress: { label: 'En cours', variant: 'warning' },
  completed: { label: 'Terminé', variant: 'info' },
  cancelled: { label: 'Annulé', variant: 'error' },
};

const CANCELLABLE_BOOKING_STATUSES: Booking['status'][] = ['pending', 'accepted'];
const CANCELLABLE_RIDE_STATUSES: Ride['status'][] = ['draft', 'published', 'full'];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Aujourd'hui, ${time}`;
  return `${date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

export default function TripsScreen(): React.JSX.Element {
  const { data: bookings, isLoading: isBookingsLoading } = useListMyBookingsQuery();
  const { data: driverProfile } = useGetMyDriverProfileQuery();
  const { data: myRides } = useListMyRidesQuery(undefined, { skip: !driverProfile });
  const [cancelRide] = useCancelRideMutation();
  // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md): cancelling a
  // booking now goes through CancellationSheet (policy consequence shown
  // before confirming) instead of firing the mutation instantly on tap.
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);

  function goToDriverFlow(): void {
    router.push(driverProfile ? '/(tabs)/publish' : '/driver/onboarding/vehicle');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text variant="headlineDisplay">Mes trajets</Text>

        <TouchableOpacity style={styles.publishCard} onPress={goToDriverFlow} activeOpacity={0.8}>
          <View style={styles.publishIcon}>
            <Ionicons name="add" size={22} color={colors.white} />
          </View>
          <View style={styles.publishTextCol}>
            <Text style={styles.publishTitle}>
              {driverProfile ? 'Publier un trajet' : 'Devenir conducteur'}
            </Text>
            <Text variant="bodySmall" color={colors.gray600}>
              {driverProfile
                ? 'Proposez des places et gagnez de la contribution'
                : 'Ajoutez votre véhicule pour commencer à conduire'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
        </TouchableOpacity>

        {driverProfile && myRides && myRides.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" color={colors.gray600} style={styles.sectionLabel}>
              Mes trajets publiés
            </Text>
            {myRides.map((ride) => {
              const meta = RIDE_STATUS[ride.status];
              return (
                <View key={ride.id} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text variant="label">
                      {ride.originLabel} → {ride.destinationLabel}
                    </Text>
                    <Text variant="bodySmall" color={colors.gray600}>
                      {formatWhen(ride.departureAt)} · {ride.seatsAvailable}/{ride.seatsTotal}{' '}
                      places · {ride.contributionPerSeat} DT
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Badge label={meta.label} variant={meta.variant} />
                    {CANCELLABLE_RIDE_STATUSES.includes(ride.status) ? (
                      <TouchableOpacity onPress={() => void cancelRide(ride.id)} hitSlop={8}>
                        <Text variant="bodySmall" color={colors.error}>
                          Annuler
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text variant="label" color={colors.gray600} style={styles.sectionLabel}>
            Mes réservations
          </Text>
          {isBookingsLoading ? (
            <ActivityIndicator size="small" color={colors.secondary} style={styles.loading} />
          ) : bookings && bookings.length > 0 ? (
            bookings.map((booking) => {
              const meta = BOOKING_STATUS[booking.status];
              return (
                <View key={booking.id} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text variant="label">
                      {booking.ride
                        ? `${booking.ride.originLabel} → ${booking.ride.destinationLabel}`
                        : 'Trajet'}
                    </Text>
                    <Text variant="bodySmall" color={colors.gray600}>
                      {booking.ride?.driverFullName?.split(' ')[0] ?? 'Conducteur'}
                      {booking.ride ? ` · ${formatWhen(booking.ride.departureAt)}` : ''}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Badge label={meta.label} variant={meta.variant} />
                    {CANCELLABLE_BOOKING_STATUSES.includes(booking.status) ? (
                      <TouchableOpacity onPress={() => setCancellingBookingId(booking.id)} hitSlop={8}>
                        <Text variant="bodySmall" color={colors.error}>
                          Annuler
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })
          ) : (
            <Text variant="body" color={colors.gray500} style={styles.empty}>
              Aucune réservation pour le moment — recherchez un trajet pour commencer.
            </Text>
          )}
        </View>
      </ScrollView>

      <CancellationSheet
        visible={!!cancellingBookingId}
        bookingId={cancellingBookingId ?? ''}
        role="rider"
        onClose={() => setCancellingBookingId(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['4xl'],
  },
  publishCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 1,
  },
  publishIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishTextCol: {
    flex: 1,
  },
  publishTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray900,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  loading: {
    marginTop: spacing.md,
  },
  empty: {
    paddingVertical: spacing.md,
  },
});
