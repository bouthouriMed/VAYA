import { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  Button,
  Icon,
  EmptyState,
  MapPreview,
  useAppTheme,
  spacing,
  radii,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppSelector } from '../../src/state/store';
import {
  useListMyBookingsQuery,
  useListMyRidesQuery,
  useGetMyDriverProfileQuery,
  useListNotificationsQuery,
  type Booking,
  type Ride,
} from '../../src/state/api';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';
import { RideRequestsSheet } from '../../src/features/driver-rides/RideRequestsSheet';
import { ManageRideSheet } from '../../src/features/driver-rides/ManageRideSheet';
import { DriverBookingDetailSheet } from '../../src/features/driver-rides/DriverBookingDetailSheet';
import {
  pickNextUpcomingRide,
  orderRemainingRides,
  estimateArrivalLabel,
} from '../../src/features/driver-rides/myRidesHelpers';
import { decodePolyline } from '../../src/utils/polyline';

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

const UPCOMING_RIDE_STATUSES: Ride['status'][] = ['draft', 'published', 'full'];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Aujourd'hui, ${time}`;
  return `${date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

function formatRowDate(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}, ${time}`;
}

type Segment = 'rider' | 'driver';

/** Stitch's "My Rides" driver dashboard (stitch/publish_ride/
 * my-rides-driver-dashboard.html) — hero card for the next upcoming drive
 * (real map thumbnail, real seats/price), a Passager/Conducteur segmented
 * control over the two lists, and the hero's two actions backed by real
 * surfaces: "Demandes" opens the per-ride requests sheet (accept/decline),
 * "Gérer" opens ride management (facts + two-step cancel). */
export default function TripsScreen(): React.JSX.Element {
  const theme = useAppTheme().colors;
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const { data: bookings, isLoading: isBookingsLoading } = useListMyBookingsQuery(undefined, {
    skip: !accessToken,
  });
  const { data: driverProfile } = useGetMyDriverProfileQuery(undefined, { skip: !accessToken });
  const { data: myRides } = useListMyRidesQuery(undefined, { skip: !driverProfile });
  // Defaults to rider; flips to driver once we know there IS a driver
  // profile — never shows an empty driving list to someone who can't drive.
  const [segment, setSegment] = useState<Segment>('rider');
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [requestsRideId, setRequestsRideId] = useState<string | null>(null);
  const [managedRide, setManagedRide] = useState<Ride | null>(null);
  const [managedBooking, setManagedBooking] = useState<Booking | null>(null);

  // Same query/poll the explore tab's header bell and the notifications
  // inbox itself already use — no new endpoint, just a second reader of the
  // same cache entry.
  const { data: notifications } = useListNotificationsQuery(undefined, {
    pollingInterval: 30_000,
    skip: !accessToken,
  });
  const hasUnreadNotifications = notifications?.some((n) => !n.readAt) ?? false;

  useEffect(() => {
    if (driverProfile) setSegment('driver');
  }, [driverProfile]);

  const heroRide = useMemo(() => pickNextUpcomingRide(myRides ?? []), [myRides]);
  const remainingRides = useMemo(
    () => orderRemainingRides(myRides ?? [], heroRide?.id ?? null),
    [myRides, heroRide],
  );
  const heroPolyline = useMemo(
    () => (heroRide?.routePolyline ? decodePolyline(heroRide.routePolyline) : []),
    [heroRide],
  );
  const heroArrivalLabel = heroRide
    ? estimateArrivalLabel(heroRide.departureAt, heroRide.estimatedDurationSec)
    : null;

  function goToDriverFlow(): void {
    router.push(driverProfile ? '/(tabs)/publish' : '/driver/onboarding/vehicle');
  }

  const upcomingBookings = (bookings ?? []).filter((booking) =>
    ['pending', 'accepted'].includes(booking.status),
  );
  const pastBookings = (bookings ?? []).filter(
    (booking) => !['pending', 'accepted'].includes(booking.status),
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Page header */}
        <View style={styles.pageHeaderRow}>
          <View style={styles.pageHeader}>
            <Text variant="headlineDisplay" color={theme.ink}>
              Mes trajets
            </Text>
            <Text variant="body" color={theme.inkMuted}>
              Gérez vos trajets à venir et passés.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel={hasUnreadNotifications ? 'Notifications (non lues)' : 'Notifications'}
            style={[styles.notificationButton, { backgroundColor: theme.surface }]}
          >
            <Icon name="notifications-outline" size="sm" color={theme.ink} />
            {hasUnreadNotifications ? (
              <View style={[styles.notificationDot, { backgroundColor: theme.accent, borderColor: theme.surface }]} />
            ) : null}
          </TouchableOpacity>
        </View>

        {!accessToken ? (
          <View style={styles.guestEmptyWrap}>
            <EmptyState
              icon={<Icon name="car-sport-outline" size="lg" color={theme.inkFaint} />}
              title="Trouvez votre premier trajet"
              description="Recherchez un trajet pour commencer à voyager avec VAYA — vous pourrez suivre vos réservations ici."
              actionLabel="Rechercher un trajet"
              onAction={() => router.navigate('/(tabs)/explore')}
            />
          </View>
        ) : (
          <>
            <TouchableOpacity style={[styles.publishCard, { backgroundColor: theme.surface }]} onPress={goToDriverFlow} activeOpacity={0.8}>
          <View style={[styles.publishIcon, { backgroundColor: theme.accent }]}>
            <Ionicons name="add" size={22} color={theme.onAccent} />
          </View>
          <View style={styles.publishTextCol}>
            <Text style={[styles.publishTitle, { color: theme.ink }]}>
              {driverProfile ? 'Publier un trajet' : 'Devenir conducteur'}
            </Text>
            <Text variant="bodySmall" color={theme.inkMuted}>
              {driverProfile
                ? 'Proposez des places et gagnez de la contribution'
                : 'Ajoutez votre véhicule pour commencer à conduire'}
            </Text>
          </View>
          <Icon name="chevron-forward" size="sm" color={theme.inkFaint} />
        </TouchableOpacity>

        {/* Upcoming ride hero */}
        {heroRide ? (
          <View style={styles.heroSection}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              Prochain trajet
            </Text>
            <View style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <MapPreview
                height={128}
                badge={RIDE_STATUS[heroRide.status].label}
                origin={{ latitude: heroRide.originLat, longitude: heroRide.originLng }}
                destination={{ latitude: heroRide.destinationLat, longitude: heroRide.destinationLng }}
                routeCoordinates={heroPolyline}
                style={styles.heroMap}
              />
              <View style={styles.heroBody}>
                <View style={styles.heroHeaderRow}>
                  <View style={styles.heroTitleCol}>
                    <Text variant="h3" color={theme.ink}>
                      {`${heroRide.originLabel} → ${heroRide.destinationLabel}`}
                    </Text>
                    <Text variant="bodySmall" color={theme.inkMuted}>
                      {`${formatWhen(heroRide.departureAt)} • ${heroRide.seatsAvailable} place${heroRide.seatsAvailable > 1 ? 's' : ''} disponible${heroRide.seatsAvailable > 1 ? 's' : ''}`}
                    </Text>
                  </View>
                  <View style={styles.priceCol}>
                    <Text variant="h3" color={theme.ink}>
                      {`${heroRide.contributionPerSeat} DT`}
                    </Text>
                    <Text variant="caption" color={theme.inkMuted}>
                      par place
                    </Text>
                  </View>
                </View>

                <View style={styles.timeline}>
                  <View style={styles.timelineDots}>
                    <View style={[styles.dotOutline, { borderColor: theme.ink }]} />
                    <View style={[styles.dotConnector, { backgroundColor: theme.outlineVariant }]} />
                    <View style={[styles.dotFilled, { backgroundColor: theme.accent }]} />
                  </View>
                  <View style={styles.timelineEntries}>
                    <View style={styles.timelineEntry}>
                      <Text variant="caption" color={theme.inkMuted}>
                        {new Date(heroRide.departureAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text variant="body" color={theme.ink} numberOfLines={1}>
                        {heroRide.originLabel}
                      </Text>
                    </View>
                    <View style={styles.timelineEntry}>
                      {heroArrivalLabel ? (
                        <Text variant="caption" color={theme.inkMuted}>
                          {`${heroArrivalLabel} (est.)`}
                        </Text>
                      ) : null}
                      <Text variant="body" color={theme.ink} numberOfLines={1}>
                        {heroRide.destinationLabel}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.heroActions}>
                  <Button
                    label="Gérer"
                    variant="secondary"
                    theme={theme}
                    onPress={() => setManagedRide(heroRide)}
                    style={styles.heroButton}
                  />
                  <Button
                    label="Demandes"
                    theme={theme}
                    onPress={() => setRequestsRideId(heroRide.id)}
                    style={styles.heroButton}
                  />
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* Segmented control */}
        <View style={[styles.segmentTrack, { backgroundColor: theme.surfaceMuted }]}>
          {(
            [
              { key: 'driver' as Segment, label: 'Conducteur' },
              { key: 'rider' as Segment, label: 'Passager' },
            ]
          ).map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.segmentItem,
                segment === key ? { backgroundColor: theme.surface } : null,
              ]}
              onPress={() => setSegment(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: segment === key }}
              accessibilityLabel={label}
            >
              <Text
                variant="bodySmall"
                color={segment === key ? theme.ink : theme.inkMuted}
                style={segment === key ? styles.segmentActiveLabel : undefined}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {segment === 'driver' ? (
          <View style={styles.section}>
            {!driverProfile ? (
              <EmptyState
                icon={<Icon name="car-outline" size="lg" color={theme.inkFaint} />}
                title="Vous ne conduisez pas encore"
                description="Ajoutez votre véhicule pour publier vos premiers trajets."
                actionLabel="Devenir conducteur"
                onAction={goToDriverFlow}
              />
            ) : remainingRides.length === 0 && !heroRide ? (
              <EmptyState
                icon={<Icon name="car-outline" size="lg" color={theme.inkFaint} />}
                title="Aucun trajet publié"
                description="Publiez un trajet pour remplir vos places vides."
                actionLabel="Publier un trajet"
                onAction={goToDriverFlow}
              />
            ) : (
              remainingRides.map((ride) => {
                const meta = RIDE_STATUS[ride.status];
                const cancellable =
                  UPCOMING_RIDE_STATUSES.includes(ride.status) &&
                  new Date(ride.departureAt).getTime() > Date.now();
                return (
                  <View key={ride.id} style={[styles.historyCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
                    <View style={[styles.historyTile, { backgroundColor: theme.surfaceMuted }]}>
                      <Icon name="car-outline" size="md" color={theme.inkMuted} />
                    </View>
                    <View style={styles.historyText}>
                      <Text variant="body" color={theme.ink} numberOfLines={1}>
                        {`${ride.originLabel} → ${ride.destinationLabel}`}
                      </Text>
                      <Text variant="caption" color={theme.inkMuted}>
                        {`${formatRowDate(ride.departureAt)} • ${meta.label}`}
                      </Text>
                    </View>
                    <View style={styles.historyRight}>
                      <Text variant="body" color={theme.ink}>
                        {`${ride.contributionPerSeat} DT`}
                      </Text>
                      {cancellable ? (
                        <TouchableOpacity onPress={() => setManagedRide(ride)} hitSlop={8}>
                          <Text variant="caption" color={theme.error}>
                            Annuler
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <View style={styles.section}>
            {isBookingsLoading ? (
              <ActivityIndicator size="small" color={theme.accent} style={styles.loading} />
            ) : (bookings?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Icon name="search-outline" size="lg" color={theme.inkFaint} />}
                title="Aucune réservation"
                description="Recherchez un trajet pour réserver votre première place."
                actionLabel="Trouver un trajet"
                onAction={() => router.navigate('/(tabs)/explore')}
              />
            ) : (
              <>
                {upcomingBookings.map((booking) => {
                  const meta = BOOKING_STATUS[booking.status];
                  return (
                    <View key={booking.id} style={[styles.historyCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
                      <View style={[styles.historyTile, { backgroundColor: theme.surfaceMuted }]}>
                        <Icon name="person-outline" size="md" color={theme.inkMuted} />
                      </View>
                      <View style={styles.historyText}>
                        <Text variant="body" color={theme.ink} numberOfLines={1}>
                          {booking.ride
                            ? `${booking.ride.originLabel} → ${booking.ride.destinationLabel}`
                            : 'Trajet'}
                        </Text>
                        <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
                          {booking.ride
                            ? `${formatWhen(booking.ride.departureAt)} · ${meta.label}`
                            : meta.label}
                        </Text>
                      </View>
                      <View style={styles.historyRight}>
                        {CANCELLABLE_BOOKING_STATUSES.includes(booking.status) ? (
                          <TouchableOpacity onPress={() => setCancellingBookingId(booking.id)} hitSlop={8}>
                            <Text variant="caption" color={theme.error}>
                              Annuler
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                {pastBookings.length > 0 ? (
                  <>
                    <Text variant="label" color={theme.inkMuted} style={[styles.sectionHeading, styles.pastHeading]}>
                      Passés
                    </Text>
                    {pastBookings.map((booking) => {
                      const meta = BOOKING_STATUS[booking.status];
                      return (
                        <View key={booking.id} style={[styles.historyCard, styles.pastCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
                          <View style={[styles.historyTile, { backgroundColor: theme.surfaceMuted }]}>
                            <Icon name="checkmark-circle-outline" size="md" color={theme.inkFaint} />
                          </View>
                          <View style={styles.historyText}>
                            <Text variant="body" color={theme.ink} numberOfLines={1}>
                              {booking.ride
                                ? `${booking.ride.originLabel} → ${booking.ride.destinationLabel}`
                                : 'Trajet'}
                            </Text>
                            <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
                              {booking.ride
                                ? `${formatRowDate(booking.ride.departureAt)} • ${meta.label}`
                                : meta.label}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                ) : null}
              </>
            )}
          </View>
        )}
          </>
        )}
      </ScrollView>

      <CancellationSheet
        visible={!!cancellingBookingId}
        bookingId={cancellingBookingId ?? ''}
        role="rider"
        onClose={() => setCancellingBookingId(null)}
      />
      <RideRequestsSheet
        visible={!!requestsRideId}
        rideId={requestsRideId ?? ''}
        onClose={() => setRequestsRideId(null)}
        onManageBooking={(booking) => {
          // Sequential, not stacked: closing the requests sheet before
          // opening the booking detail one avoids two overlapping sheet
          // backdrops/animations at once.
          setRequestsRideId(null);
          setManagedBooking(booking);
        }}
      />
      <ManageRideSheet
        visible={!!managedRide}
        ride={managedRide}
        onClose={() => setManagedRide(null)}
      />
      <DriverBookingDetailSheet
        visible={!!managedBooking}
        booking={managedBooking}
        onClose={() => setManagedBooking(null)}
      />
    </SafeAreaView>
  );
}

const CANCELLABLE_BOOKING_STATUSES: Booking['status'][] = ['pending', 'accepted'];

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['4xl'],
  },
  pageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  pageHeader: {
    flex: 1,
    gap: 2,
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  sectionHeading: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  publishCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  publishIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishTextCol: {
    flex: 1,
  },
  publishTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  heroSection: {
    gap: spacing.sm,
  },
  heroCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroMap: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  heroBody: {
    padding: spacing.md,
    gap: spacing.md,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  heroTitleCol: {
    flex: 1,
    gap: 2,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  timeline: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timelineDots: {
    width: 14,
    alignItems: 'center',
  },
  dotOutline: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  dotConnector: {
    flex: 1,
    minHeight: 24,
    width: 2,
    marginVertical: 2,
  },
  dotFilled: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineEntries: {
    flex: 1,
    gap: spacing.sm,
  },
  timelineEntry: {
    gap: 1,
  },
  heroActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroButton: {
    flex: 1,
  },
  segmentTrack: {
    flexDirection: 'row',
    borderRadius: radii.lg,
    padding: 4,
    marginTop: spacing.xs,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.md,
  },
  segmentActiveLabel: {
    fontWeight: '600',
  },
  section: {
    gap: spacing.sm,
  },
  pastHeading: {
    marginTop: spacing.xs,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  pastCard: {
    opacity: 0.75,
  },
  historyTile: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyText: {
    flex: 1,
    gap: 1,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  loading: {
    marginTop: spacing.md,
  },
  guestEmptyWrap: {
    paddingTop: spacing['3xl'],
  },
});
