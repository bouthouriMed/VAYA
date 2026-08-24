import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  Button,
  Icon,
  Avatar,
  Badge,
  EmptyState,
  MapPreview,
  useAppTheme,
  spacing,
  radii,
} from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppSelector } from '../../src/state/store';
import {
  useListMyBookingsQuery,
  useListMyRidesQuery,
  useGetMyDriverProfileQuery,
  useListNotificationsQuery,
  type Booking,
  type Ride,
} from '../../src/state/api';
import {
  pickNextUpcomingRide,
  orderRemainingRides,
  estimateArrivalLabel,
} from '../../src/features/driver-rides/myRidesHelpers';
import { decodePolyline } from '../../src/utils/polyline';

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];
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

type CardCounterpart =
  | { kind: 'person'; name: string; avatarUrl?: string | null }
  | { kind: 'text'; label: string };

/**
 * World-class trip card (2026-08-23 redesign): a status pill up top, a real
 * dot→line→pin timeline connecting origin and destination, and a bottom
 * row pairing the counter-party (driver for a rider's booking, seat
 * availability for a driver's own ride — no per-row passenger-profile
 * fetch, see the driver-rides section below for why) with the price. The
 * whole card is the tap target; there is no standalone "Annuler" link on
 * the card root any more — cancelling now lives inside the pushed detail
 * screen (bookings/[bookingId].tsx / driver/rides/[rideId].tsx).
 */
function TripCard({
  theme,
  dateTimeLabel,
  badge,
  originLabel,
  destinationLabel,
  counterpart,
  priceLabel,
  onPress,
  dimmed,
}: {
  theme: ThemeColors;
  dateTimeLabel: string;
  badge: { label: string; variant: BadgeVariant };
  originLabel: string;
  destinationLabel: string;
  counterpart: CardCounterpart;
  priceLabel: string;
  onPress: () => void;
  dimmed?: boolean;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[
        styles.tripCard,
        { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
        dimmed && styles.tripCardDimmed,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${originLabel} vers ${destinationLabel}, ${dateTimeLabel}, ${badge.label}`}
    >
      <View style={styles.tripCardTopRow}>
        <Text variant="label" color={theme.ink} style={styles.tripCardDate}>
          {dateTimeLabel}
        </Text>
        <Badge label={badge.label} variant={badge.variant} theme={theme} />
      </View>

      <View style={styles.timeline}>
        <View style={styles.timelineDots}>
          <View style={[styles.dotOutline, { borderColor: theme.ink }]} />
          <View style={[styles.dotConnector, { backgroundColor: theme.outlineVariant }]} />
          <View style={[styles.dotFilled, { backgroundColor: theme.accent }]} />
        </View>
        <View style={styles.timelineEntries}>
          <Text variant="body" color={theme.ink} numberOfLines={1}>
            {originLabel}
          </Text>
          <Text variant="body" color={theme.ink} numberOfLines={1}>
            {destinationLabel}
          </Text>
        </View>
      </View>

      <View style={[styles.tripCardBottomRow, { borderTopColor: theme.outlineVariant }]}>
        {counterpart.kind === 'person' ? (
          <View style={styles.counterpartRow}>
            <Avatar
              uri={counterpart.avatarUrl}
              name={counterpart.name}
              sizePx={28}
              fallbackBackgroundColor={theme.surfaceMuted}
              fallbackTextColor={theme.ink}
            />
            <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={1} style={styles.counterpartName}>
              {counterpart.name}
            </Text>
          </View>
        ) : (
          <View style={styles.counterpartRow}>
            <Icon name="people-outline" size="xs" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={1}>
              {counterpart.label}
            </Text>
          </View>
        )}
        <Text variant="label" color={theme.ink}>
          {priceLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/** Stitch's "My Rides" driver dashboard (stitch/publish_ride/
 * my-rides-driver-dashboard.html) — hero card for the next upcoming drive
 * (real map thumbnail, real seats/price), a Passager/Conducteur segmented
 * control over the two lists, and one consolidated "Gérer ce trajet" action
 * that opens the real trip hub (driver/rides/[rideId].tsx — replaces what
 * used to be two separate bottom sheets, RideRequestsSheet and
 * ManageRideSheet, with one real screen that shows requests, passengers,
 * and cancellation together). */
export default function TripsScreen(): React.JSX.Element {
  const theme = useAppTheme().colors;
  const { openRequestsForRide } = useLocalSearchParams<{ openRequestsForRide?: string }>();
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const { data: bookings, isLoading: isBookingsLoading } = useListMyBookingsQuery(undefined, {
    skip: !accessToken,
  });
  const { data: driverProfile } = useGetMyDriverProfileQuery(undefined, { skip: !accessToken });
  const { data: myRides } = useListMyRidesQuery(undefined, { skip: !driverProfile });
  // Defaults to rider; flips once we know which role actually HAS trips —
  // never leaves a driver staring at an empty "Passager" tab when their
  // real activity is on the "Conducteur" side, or vice versa.
  const [segment, setSegment] = useState<Segment>('rider');
  const [segmentTouched, setSegmentTouched] = useState(false);

  // Same query/poll the explore tab's header bell and the notifications
  // inbox itself already use — no new endpoint, just a second reader of the
  // same cache entry.
  const { data: notifications } = useListNotificationsQuery(undefined, {
    pollingInterval: 30_000,
    skip: !accessToken,
  });
  const hasUnreadNotifications = notifications?.some((n) => !n.readAt) ?? false;

  const heroRide = useMemo(() => pickNextUpcomingRide(myRides ?? []), [myRides]);
  const remainingRides = useMemo(
    () => orderRemainingRides(myRides ?? [], heroRide?.id ?? null),
    [myRides, heroRide],
  );
  const upcomingBookings = (bookings ?? []).filter((booking) =>
    ['pending', 'accepted'].includes(booking.status),
  );
  const pastBookings = (bookings ?? []).filter(
    (booking) => !['pending', 'accepted'].includes(booking.status),
  );

  useEffect(() => {
    if (segmentTouched) return;
    if (!driverProfile) {
      setSegment('rider');
      return;
    }
    const driverHasTrips = Boolean(heroRide) || remainingRides.length > 0;
    const riderHasTrips = upcomingBookings.length > 0;
    if (riderHasTrips && !driverHasTrips) setSegment('rider');
    else setSegment('driver');
  }, [driverProfile, heroRide, remainingRides.length, upcomingBookings.length, segmentTouched]);

  // A "new request" notification tap (deepLink.ts) lands here with the
  // specific ride already known — opens the real trip hub for it directly,
  // same destination the dashboard's own "Gérer ce trajet" button uses.
  useEffect(() => {
    if (openRequestsForRide) {
      router.push({ pathname: '/driver/rides/[rideId]', params: { rideId: openRequestsForRide } });
    }
  }, [openRequestsForRide]);

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

  function selectSegment(next: Segment): void {
    setSegmentTouched(true);
    setSegment(next);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Page header */}
        <View style={styles.pageHeaderRow}>
          <View style={styles.pageHeader}>
            <Text variant="headlineDisplay" color={theme.ink} style={styles.heading}>
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
            {/* Driver-onboarding entry point only ever shown once the driver
                role is actually the active context here — a pure passenger
                never sees this banner competing for space with their real
                upcoming trips; driver onboarding stays discoverable from
                Profile's own existing CTA instead (unchanged). */}
            {driverProfile || segment === 'driver' ? (
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
            ) : null}

        {/* Upcoming ride hero */}
        {heroRide && segment === 'driver' ? (
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

                <Button
                  label="Gérer ce trajet"
                  theme={theme}
                  onPress={() =>
                    router.push({ pathname: '/driver/rides/[rideId]', params: { rideId: heroRide.id } })
                  }
                  style={styles.heroButton}
                />
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
              onPress={() => selectSegment(key)}
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
                const past = !UPCOMING_RIDE_STATUSES.includes(ride.status);
                return (
                  <TripCard
                    key={ride.id}
                    theme={theme}
                    dateTimeLabel={formatWhen(ride.departureAt)}
                    badge={RIDE_STATUS[ride.status]}
                    originLabel={ride.originLabel}
                    destinationLabel={ride.destinationLabel}
                    counterpart={{
                      kind: 'text',
                      label: `${ride.seatsTotal - ride.seatsAvailable}/${ride.seatsTotal} places réservées`,
                    }}
                    priceLabel={`${ride.contributionPerSeat} DT`}
                    onPress={() =>
                      router.push({ pathname: '/driver/rides/[rideId]', params: { rideId: ride.id } })
                    }
                    dimmed={past}
                  />
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
                {upcomingBookings.map((booking) => (
                  <TripCard
                    key={booking.id}
                    theme={theme}
                    dateTimeLabel={booking.ride ? formatWhen(booking.ride.departureAt) : ''}
                    badge={BOOKING_STATUS[booking.status]}
                    originLabel={booking.ride?.originLabel ?? 'Départ'}
                    destinationLabel={booking.ride?.destinationLabel ?? 'Arrivée'}
                    counterpart={{ kind: 'person', name: booking.ride?.driverFullName ?? 'Conducteur' }}
                    priceLabel={`${booking.contributionTotal} DT`}
                    onPress={() =>
                      router.push({ pathname: '/bookings/[bookingId]', params: { bookingId: booking.id } })
                    }
                  />
                ))}
                {pastBookings.length > 0 ? (
                  <>
                    <Text variant="label" color={theme.inkMuted} style={[styles.sectionHeading, styles.pastHeading]}>
                      Passés
                    </Text>
                    {pastBookings.map((booking) => (
                      <TripCard
                        key={booking.id}
                        theme={theme}
                        dateTimeLabel={booking.ride ? formatWhen(booking.ride.departureAt) : ''}
                        badge={BOOKING_STATUS[booking.status]}
                        originLabel={booking.ride?.originLabel ?? 'Départ'}
                        destinationLabel={booking.ride?.destinationLabel ?? 'Arrivée'}
                        counterpart={{ kind: 'person', name: booking.ride?.driverFullName ?? 'Conducteur' }}
                        priceLabel={`${booking.contributionTotal} DT`}
                        onPress={() =>
                      router.push({ pathname: '/bookings/[bookingId]', params: { bookingId: booking.id } })
                    }
                        dimmed
                      />
                    ))}
                  </>
                ) : null}
              </>
            )}
          </View>
        )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type Segment = 'rider' | 'driver';

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
    marginTop: 5
  },
  pageHeader: {
    flex: 1,
    gap: 17,
  },
  heading: {
    textAlign: 'center',
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
    minHeight: 20,
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
    justifyContent: 'center',
  },
  timelineEntry: {
    gap: 1,
  },
  heroButton: {
    width: '100%',
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
  loading: {
    marginTop: spacing.md,
  },
  guestEmptyWrap: {
    paddingTop: spacing['3xl'],
  },
  tripCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tripCardDimmed: {
    opacity: 0.75,
  },
  tripCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tripCardDate: {
    fontWeight: '700',
  },
  tripCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  counterpartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  counterpartName: {
    flexShrink: 1,
  },
});
