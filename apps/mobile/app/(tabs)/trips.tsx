import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatDate, formatTime, formatCurrency } from '../../src/utils/localeFormat';
import type { SupportedLocale } from '@vaya/config';
import {
  Text,
  Button,
  Icon,
  Avatar,
  Badge,
  EmptyState,
  MapPreview,
  useAppTheme,
  haptics,
  spacing,
  radii,
} from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppSelector } from '../../src/state/store';
import {
  useListMyBookingsQuery,
  useListMyRidesQuery,
  useGetRideQuery,
  useGetMyDriverProfileQuery,
  useListNotificationsQuery,
  type Booking,
  type Ride,
} from '../../src/state/api';
import {
  pickNextUpcomingRide,
  orderRemainingRides,
  estimateArrivalLabel,
  computeTripPhase,
} from '../../src/features/driver-rides/myRidesHelpers';
import { decodePolyline, sliceRouteBetween } from '../../src/utils/polyline';
import { shortenPlaceLabel } from '../../src/utils/placeLabel';

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];
type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

function getBookingStatus(t: (key: string) => string, status: Booking['status']): { label: string; variant: BadgeVariant } {
  const statusMap: Record<Booking['status'], { key: string; variant: BadgeVariant }> = {
    pending: { key: 'booking:status_pending', variant: 'warning' },
    accepted: { key: 'booking:status_accepted', variant: 'success' },
    declined: { key: 'booking:status_declined', variant: 'error' },
    cancelled_by_rider: { key: 'booking:status_cancelled_by_rider', variant: 'default' },
    cancelled_by_driver: { key: 'booking:status_cancelled_by_driver', variant: 'error' },
    expired: { key: 'booking:status_expired', variant: 'default' },
    completed: { key: 'booking:status_completed', variant: 'info' },
    no_show: { key: 'booking:status_no_show', variant: 'error' },
  };
  const { key, variant } = statusMap[status];
  return { label: t(key), variant };
}

function getRideStatus(t: (key: string) => string, status: Ride['status']): { label: string; variant: BadgeVariant } {
  const statusMap: Record<Ride['status'], { key: string; variant: BadgeVariant }> = {
    draft: { key: 'booking:status_draft', variant: 'default' },
    published: { key: 'booking:status_published', variant: 'success' },
    full: { key: 'booking:status_full', variant: 'info' },
    in_progress: { key: 'booking:status_in_progress', variant: 'warning' },
    completed: { key: 'booking:status_completed', variant: 'info' },
    cancelled: { key: 'booking:status_cancelled_by_driver', variant: 'error' },
  };
  const { key, variant } = statusMap[status];
  return { label: t(key), variant };
}

const UPCOMING_RIDE_STATUSES: Ride['status'][] = ['draft', 'published', 'full'];

function formatWhen(iso: string, t: (key: string) => string, locale: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = formatTime(date, locale as any);
  if (isToday) return `${t('common:time.today')}, ${time}`;
  return `${formatDate(date, locale as any, { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

type CardCounterpart =
  | { kind: 'person'; name: string; avatarUrl?: string | null; userId?: string }
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
  const { t } = useTranslation('common');
  return (
    <TouchableOpacity
      style={[
        styles.tripCard,
        { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
        dimmed && styles.tripCardDimmed,
      ]}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${originLabel} → ${destinationLabel}, ${dateTimeLabel}, ${badge.label}`}
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
            {counterpart.userId ? (
              <TouchableOpacity
                onPress={() =>
                  router.push({ pathname: '/search/trust', params: { driverUserId: counterpart.userId! } })
                }
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.viewProfile', { name: counterpart.name })}
              >
                <Avatar
                  uri={counterpart.avatarUrl}
                  name={counterpart.name}
                  sizePx={28}
                  fallbackBackgroundColor={theme.surfaceMuted}
                  fallbackTextColor={theme.ink}
                />
              </TouchableOpacity>
            ) : (
              <Avatar
                uri={counterpart.avatarUrl}
                name={counterpart.name}
                sizePx={28}
                fallbackBackgroundColor={theme.surfaceMuted}
                fallbackTextColor={theme.ink}
              />
            )}
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
  const { colors: theme, scheme } = useAppTheme();
  const { t } = useTranslation(['trips', 'booking', 'common']);
  const locale = useAppSelector((s) => s.language.locale) || 'en';
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

  // An actually in-progress ride (the driver already tapped "Démarrer") is
  // more hero-worthy than a merely soonest-scheduled one — isUpcomingRide/
  // pickNextUpcomingRide deliberately treat in_progress as *not* upcoming
  // (myRidesHelpers.test.ts's "rejects terminal-status rides even in the
  // future" case, in_progress included — a real trip underway isn't
  // "upcoming", it's a distinct phase, computeTripPhase's own reason to
  // exist), so this list screen needs its own priority rule on top rather
  // than changing what "upcoming" means everywhere else.
  const inProgressRide = useMemo(
    () => (myRides ?? []).find((ride) => computeTripPhase(ride) === 'in_progress') ?? null,
    [myRides],
  );
  const heroRide = useMemo(
    () => inProgressRide ?? pickNextUpcomingRide(myRides ?? []),
    [myRides, inProgressRide],
  );
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
  // Mirrors heroRide above: an in-progress booking (its ride already
  // started) takes priority over a merely soonest-departing one — a
  // booking's own status stays 'accepted' throughout both, only the
  // embedded ride.status can tell them apart.
  const riderHeroBooking = useMemo(() => {
    if (upcomingBookings.length === 0) return null;
    const inProgress = upcomingBookings.find((booking) => booking.ride?.status === 'in_progress');
    if (inProgress) return inProgress;
    return upcomingBookings.reduce((soonest, booking) => {
      if (!booking.ride) return soonest;
      if (!soonest.ride) return booking;
      return new Date(booking.ride.departureAt).getTime() < new Date(soonest.ride.departureAt).getTime()
        ? booking
        : soonest;
    });
  }, [upcomingBookings]);
  const remainingUpcomingBookings = upcomingBookings.filter(
    (booking) => booking.id !== riderHeroBooking?.id,
  );
  const { data: riderHeroRide } = useGetRideQuery(riderHeroBooking?.rideId ?? '', {
    skip: !riderHeroBooking,
  });
  // This passenger's own segment, not the driver's full route — a route_
  // passthrough booking's real pickup/dropoff can sit well inside a much
  // longer route (matching-engine-redesign: "passenger sees his requested
  // route... in my trip"). Collapses to the whole route for a plain
  // endpoint-match booking.
  const riderHeroPickupPoint = riderHeroBooking
    ? { latitude: riderHeroBooking.pickupLat, longitude: riderHeroBooking.pickupLng }
    : undefined;
  const riderHeroDropoffPoint =
    riderHeroBooking?.dropoffLat != null && riderHeroBooking?.dropoffLng != null
      ? { latitude: riderHeroBooking.dropoffLat, longitude: riderHeroBooking.dropoffLng }
      : riderHeroRide
        ? { latitude: riderHeroRide.destinationLat, longitude: riderHeroRide.destinationLng }
        : undefined;
  const riderHeroPolyline = useMemo(() => {
    const fullCoordinates = riderHeroRide?.routePolyline ? decodePolyline(riderHeroRide.routePolyline) : [];
    if (fullCoordinates.length < 2 || !riderHeroPickupPoint || !riderHeroDropoffPoint) return fullCoordinates;
    return sliceRouteBetween(fullCoordinates, riderHeroPickupPoint, riderHeroDropoffPoint);
    // Deps are the primitive lat/lng values, not riderHeroPickupPoint/
    // riderHeroDropoffPoint's object identity (which changes every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    riderHeroRide,
    riderHeroBooking?.pickupLat,
    riderHeroBooking?.pickupLng,
    riderHeroBooking?.dropoffLat,
    riderHeroBooking?.dropoffLng,
  ]);
  const riderHeroArrivalLabel =
    riderHeroBooking?.ride && riderHeroRide
      ? estimateArrivalLabel(riderHeroBooking.ride.departureAt, riderHeroRide.estimatedDurationSec)
      : null;

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
              {t('trips:title')}
            </Text>
            <Text variant="body" color={theme.inkMuted}>
              {t('trips:subtitle')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              haptics.selection();
              router.push('/notifications');
            }}
            accessibilityRole="button"
            accessibilityLabel={hasUnreadNotifications ? t('trips:notificationsUnreadAria') : t('trips:notificationsAria')}
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
              title={t('trips:guestEmpty.title')}
              description={t('trips:guestEmpty.description')}
              actionLabel={t('trips:guestEmpty.cta')}
              onAction={() => router.navigate('/(tabs)/explore')}
            />
          </View>
        ) : (
          <>
        {/* Upcoming ride hero — shown whenever the driver has one, regardless
            of which segment (Conducteur/Passager) is selected below; the
            Stitch reference's "Upcoming Ride" is likewise unconditional,
            only "Recent Rides" respects the toggle. */}
        {heroRide ? (
          <View style={styles.heroSection}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              {t('trips:nextRide')}
            </Text>
            <TouchableOpacity
              style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
              onPress={() => router.push({ pathname: '/driver/rides/[rideId]', params: { rideId: heroRide.id } })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${t('trips:manageRide')} — ${heroRide.originLabel} → ${heroRide.destinationLabel}`}
            >
              <MapPreview
                height={128}
                badge={getRideStatus(t, heroRide.status).label}
                origin={{ latitude: heroRide.originLat, longitude: heroRide.originLng }}
                destination={{ latitude: heroRide.destinationLat, longitude: heroRide.destinationLng }}
                routeCoordinates={heroPolyline}
                isDark={scheme === 'dark'}
                style={styles.heroMap}
              />
              <View style={styles.heroBody}>
                <View style={styles.heroHeaderRow}>
                  <View style={styles.heroTitleCol}>
                    {/* Real place labels, shortened to "locality, admin area"
                        (utils/placeLabel.ts) — the full Google-formatted
                        address (street, postal code, full locality, country)
                        made a rural address wrap 4 lines here; the full
                        version is still shown, unabbreviated, in the
                        timeline rows below and on the ride-detail screen. */}
                    <Text variant="h3" color={theme.ink}>
                      {`${shortenPlaceLabel(heroRide.originLabel)} → ${shortenPlaceLabel(heroRide.destinationLabel)}`}
                    </Text>
                    <Text variant="bodySmall" color={theme.inkMuted}>
                      {`${formatWhen(heroRide.departureAt, t, locale)} • ${t('trips:seatsAvailable', { count: heroRide.seatsAvailable })}`}
                    </Text>
                  </View>
                  <View style={styles.priceCol}>
                    <Text variant="h3" color={theme.ink}>
                      {formatCurrency(heroRide.contributionPerSeat, locale as SupportedLocale)}
                    </Text>
                    <Text variant="caption" color={theme.inkMuted}>
                      {t('trips:perSeat')}
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
                        {formatTime(new Date(heroRide.departureAt), locale as any)}
                      </Text>
                      <Text variant="body" color={theme.ink} numberOfLines={1}>
                        {heroRide.originLabel}
                      </Text>
                    </View>
                    <View style={styles.timelineEntry}>
                      {heroArrivalLabel ? (
                        <Text variant="caption" color={theme.inkMuted}>
                          {`${heroArrivalLabel} ${t('trips:estimated')}`}
                        </Text>
                      ) : null}
                      <Text variant="body" color={theme.ink} numberOfLines={1}>
                        {heroRide.destinationLabel}
                      </Text>
                    </View>
                  </View>
                </View>

                <Button
                  label={t('trips:manageRide')}
                  theme={theme}
                  onPress={() =>
                    router.push({ pathname: '/driver/rides/[rideId]', params: { rideId: heroRide.id } })
                  }
                  style={styles.heroButton}
                />
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Rider hero — same unconditional-regardless-of-segment treatment
            as the driver hero above, for the same reason: a passenger's own
            upcoming/ongoing booking used to only ever appear buried in the
            plain "Recent Rides" list below, exactly as easy to miss as a
            driver's next ride would have been without this same card. */}
        {riderHeroBooking?.ride ? (
          <View style={styles.heroSection}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              {t('trips:nextBooking')}
            </Text>
            <View style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <MapPreview
                height={128}
                badge={getBookingStatus(t, riderHeroBooking.status).label}
                pickup={riderHeroPickupPoint}
                dropoff={riderHeroDropoffPoint}
                theme={theme}
                routeCoordinates={riderHeroPolyline}
                isDark={scheme === 'dark'}
                style={styles.heroMap}
              />
              <View style={styles.heroBody}>
                <View style={styles.heroHeaderRow}>
                  <View style={styles.heroTitleCol}>
                    <Text variant="h3" color={theme.ink}>
                      {/* This rider's own resolved journey, not the ride's
                          raw endpoints — a mid-route booking (e.g. Zaragoza
                          -> Lleida on a Madrid -> Barcelona ride) must show
                          where THIS passenger actually boards/alights, not
                          the driver's full route. */}
                      {`${riderHeroBooking.pickupLabel} → ${riderHeroBooking.dropoffLabel ?? riderHeroBooking.ride.destinationLabel}`}
                    </Text>
                    <Text variant="bodySmall" color={theme.inkMuted}>
                      {`${formatWhen(riderHeroBooking.ride.departureAt, t, locale)} • ${riderHeroBooking.ride.driverFullName ?? t('booking:driver')}`}
                    </Text>
                  </View>
                  <View style={styles.priceCol}>
                    <Text variant="h3" color={theme.ink}>
                      {formatCurrency(riderHeroBooking.contributionTotal, locale as SupportedLocale)}
                    </Text>
                    <Text variant="caption" color={theme.inkMuted}>
                      {t('trips:total')}
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
                        {formatTime(new Date(riderHeroBooking.ride.departureAt), locale as any)}
                      </Text>
                      <Text variant="body" color={theme.ink} numberOfLines={1}>
                        {riderHeroBooking.pickupLabel}
                      </Text>
                    </View>
                    <View style={styles.timelineEntry}>
                      {riderHeroArrivalLabel ? (
                        <Text variant="caption" color={theme.inkMuted}>
                          {`${riderHeroArrivalLabel} ${t('trips:estimated')}`}
                        </Text>
                      ) : null}
                      <Text variant="body" color={theme.ink} numberOfLines={1}>
                        {riderHeroBooking.dropoffLabel ?? riderHeroBooking.ride.destinationLabel}
                      </Text>
                    </View>
                  </View>
                </View>

                <Button
                  label={t('trips:viewBooking')}
                  theme={theme}
                  onPress={() =>
                    router.push({ pathname: '/bookings/[bookingId]', params: { bookingId: riderHeroBooking.id } })
                  }
                  style={styles.heroButton}
                />
              </View>
            </View>
          </View>
        ) : null}

        {/* List header — Stitch's "Recent Rides" heading with the
            Riding/Driving toggle inline beside it, scoped only to the list
            below (the hero above is unconditional, see above). */}
        <View style={styles.listHeaderRow}>
          <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
            {t('trips:recentRides')}
          </Text>
          <View style={[styles.segmentTrack, { backgroundColor: theme.surfaceMuted }]}>
            {(
              [
                { key: 'driver' as Segment, labelKey: 'trips:segmentDriver' },
                { key: 'rider' as Segment, labelKey: 'trips:segmentRider' },
              ]
            ).map(({ key, labelKey }) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.segmentItem,
                  segment === key ? { backgroundColor: theme.surface } : null,
                ]}
                onPress={() => {
                  haptics.selection();
                  selectSegment(key);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: segment === key }}
                accessibilityLabel={t(labelKey)}
              >
                <Text
                  variant="bodySmall"
                  color={segment === key ? theme.ink : theme.inkMuted}
                  style={segment === key ? styles.segmentActiveLabel : undefined}
                >
                  {t(labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {segment === 'driver' ? (
          <View style={styles.section}>
            {!driverProfile ? (
              <EmptyState
                icon={<Icon name="car-outline" size="lg" color={theme.inkFaint} />}
                title={t('trips:driverEmpty.notDriverYet')}
                description={t('trips:driverEmpty.notDriverDesc')}
                actionLabel={t('trips:driverEmpty.becomeDriver')}
                onAction={goToDriverFlow}
              />
            ) : remainingRides.length === 0 && !heroRide ? (
              <EmptyState
                icon={<Icon name="car-outline" size="lg" color={theme.inkFaint} />}
                title={t('trips:driverEmpty.noRides')}
                description={t('trips:driverEmpty.noRidesDesc')}
                actionLabel={t('trips:driverEmpty.publishRide')}
                onAction={goToDriverFlow}
              />
            ) : (
              remainingRides.map((ride) => {
                // in_progress isn't in UPCOMING_RIDE_STATUSES (it's its own
                // phase, not "upcoming" — see the hero-selection comment
                // above), but it's just as clearly not "past" either; a
                // second in-progress ride beyond the single one the hero
                // above already claimed shouldn't render dimmed like a
                // completed one would.
                const past = ride.status !== 'in_progress' && !UPCOMING_RIDE_STATUSES.includes(ride.status);
                return (
                  <TripCard
                    key={ride.id}
                    theme={theme}
                    dateTimeLabel={formatWhen(ride.departureAt, t, locale)}
                    badge={getRideStatus(t, ride.status)}
                    originLabel={ride.originLabel}
                    destinationLabel={ride.destinationLabel}
                    counterpart={{
                      kind: 'text',
                      label: t('trips:placesReserved', { count: ride.seatsTotal - ride.seatsAvailable }),
                    }}
                    priceLabel={formatCurrency(ride.contributionPerSeat, locale as SupportedLocale)}
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
                title={t('trips:riderEmpty.noBookings')}
                description={t('trips:riderEmpty.noBookingsDesc')}
                actionLabel={t('trips:riderEmpty.findRide')}
                onAction={() => router.navigate('/(tabs)/explore')}
              />
            ) : (
              <>
                {remainingUpcomingBookings.map((booking) => (
                  <TripCard
                    key={booking.id}
                    theme={theme}
                    dateTimeLabel={booking.ride ? formatWhen(booking.ride.departureAt, t, locale) : ''}
                    badge={getBookingStatus(t, booking.status)}
                    originLabel={booking.pickupLabel ?? booking.ride?.originLabel ?? t('booking:departure')}
                    destinationLabel={
                      booking.dropoffLabel ?? booking.ride?.destinationLabel ?? t('booking:arrival')
                    }
                    counterpart={{ kind: 'person', name: booking.ride?.driverFullName ?? t('booking:driver'), userId: booking.ride?.driverUserId }}
                    priceLabel={formatCurrency(booking.contributionTotal, locale as SupportedLocale)}
                    onPress={() =>
                      router.push({ pathname: '/bookings/[bookingId]', params: { bookingId: booking.id } })
                    }
                  />
                ))}
                {pastBookings.length > 0 ? (
                  <>
                    <Text variant="label" color={theme.inkMuted} style={[styles.sectionHeading, styles.pastHeading]}>
                      {t('booking:filters.past')}
                    </Text>
                    {pastBookings.map((booking) => (
                      <TripCard
                        key={booking.id}
                        theme={theme}
                        dateTimeLabel={booking.ride ? formatWhen(booking.ride.departureAt, t, locale) : ''}
                        badge={getBookingStatus(t, booking.status)}
                        originLabel={booking.pickupLabel ?? booking.ride?.originLabel ?? t('booking:departure')}
                        destinationLabel={
                          booking.dropoffLabel ?? booking.ride?.destinationLabel ?? t('booking:arrival')
                        }
                        counterpart={{ kind: 'person', name: booking.ride?.driverFullName ?? t('booking:driver'), userId: booking.ride?.driverUserId }}
                        priceLabel={formatCurrency(booking.contributionTotal, locale as SupportedLocale)}
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
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
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
  },
  segmentItem: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
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
