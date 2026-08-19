import { useRef, useState } from 'react';
import { Animated, View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  Button,
  Avatar,
  Meter,
  StatTile,
  colors,
  spacing,
  radii,
  typography,
  haptics,
} from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useGetUserPublicProfileQuery,
  useGetRideQuery,
  useCreateBookingMutation,
} from '../../src/state/api';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { clearPickupStop } from '../../src/state/searchSlice';

const HERO_HEIGHT = 200;
const HERO_AVATAR_PX = 108;
const STICKY_THRESHOLD = 120;

export default function TrustScreen(): React.JSX.Element {
  const { rideId, driverUserId } = useLocalSearchParams<{ rideId: string; driverUserId: string }>();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const origin = useAppSelector((s) => s.search.origin);
  // Set by search/pickup-point.tsx when the matched ride has real,
  // driver-selected route_stops (docs/domain/ride-engine.md). Absent for a
  // legacy ride with zero route_stops, which keeps the free-form
  // `origin`-based pickup flow below working unchanged.
  const selectedStop = useAppSelector((s) => s.search.selectedStop);
  const dispatch = useAppDispatch();
  const [bookingError, setBookingError] = useState<string | undefined>();

  const { data: profile, isLoading: isProfileLoading } = useGetUserPublicProfileQuery(driverUserId);
  const { data: ride, isLoading: isRideLoading } = useGetRideQuery(rideId);
  const [createBooking, { isLoading: isBooking }] = useCreateBookingMutation();

  const stickyBg = scrollY.interpolate({
    inputRange: [0, STICKY_THRESHOLD],
    outputRange: ['rgba(127,164,145,0)', 'rgba(127,164,145,1)'],
    extrapolate: 'clamp',
  });
  const identityOpacity = scrollY.interpolate({
    inputRange: [STICKY_THRESHOLD * 0.6, STICKY_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const heroScale = scrollY.interpolate({
    inputRange: [-120, 0],
    outputRange: [1.4, 1],
    extrapolate: 'clamp',
  });

  if (isProfileLoading || isRideLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (!profile || !ride) {
    return (
      <View style={styles.loadingWrap}>
        <Text variant="body" color={colors.gray500}>
          Profil introuvable.
        </Text>
      </View>
    );
  }

  const firstName = profile.fullName.split(' ')[0]!;
  const driverStats = profile.driver;

  async function requestSeat(): Promise<void> {
    // A selected stop (search/pickup-point.tsx) takes precedence — it's
    // the real, driver-validated point for rides that have route_stops.
    // Falls back to the free-form origin only for legacy (stop-less)
    // rides, where pickup-point.tsx is never shown in the first place.
    if (!selectedStop && !origin) return;
    setBookingError(undefined);
    try {
      const booking = await createBooking({
        rideId,
        input: {
          seatsRequested: 1,
          ...(selectedStop
            ? { pickupStopId: selectedStop.stopId }
            : { pickup: { label: origin!.label, lat: origin!.lat, lng: origin!.lng } }),
        },
      }).unwrap();
      haptics.success();
      dispatch(clearPickupStop());
      router.dismissTo({
        pathname: '/bookings/confirmed',
        params: {
          bookingId: booking.id,
          driverName: profile!.fullName,
          price: String(booking.contributionTotal),
          vehicleLabel: driverStats?.vehicle
            ? `${driverStats.vehicle.make} ${driverStats.vehicle.model} ${driverStats.vehicle.color}`
            : '',
          // Real fields from the booking we just created and the ride we
          // already fetched — every downstream screen in this flow forwards
          // `params` wholesale, so this is the single place that needs to
          // supply them (see docs/product/audit.md §4 on why these screens
          // used to show fabricated data instead).
          pickupLabel: booking.pickupLabel,
          destinationLabel: ride!.destinationLabel,
          estimatedDurationMin: ride!.estimatedDurationSec
            ? String(Math.round(ride!.estimatedDurationSec / 60))
            : '',
          // Real coordinates so the post-booking screens can render an
          // actual MapPreview (Phase 3) instead of no map at all.
          pickupLat: String(booking.pickupLat),
          pickupLng: String(booking.pickupLng),
          destinationLat: String(ride!.destinationLat),
          destinationLng: String(ride!.destinationLng),
        },
      });
    } catch {
      haptics.error();
      setBookingError('Cette place vient peut-être d’être prise. Réessayez.');
    }
  }

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.hero, { transform: [{ scale: heroScale }] }]} />

        <View style={styles.identity}>
          <Avatar name={profile.fullName} sizePx={HERO_AVATAR_PX} style={styles.heroAvatar} />
          <View style={styles.nameRow}>
            <Text variant="h2">{firstName}</Text>
            {driverStats ? (
              <Ionicons name="checkmark-circle" size={20} color={colors.secondary} />
            ) : null}
          </View>
          {driverStats ? (
            <Text variant="body" color={colors.gray600}>
              ★ {driverStats.ratingAvg.toFixed(1)} · {driverStats.tripCount} trajets
            </Text>
          ) : null}
        </View>

        {driverStats ? (
          <View style={styles.statsRow}>
            <StatTile
              icon={<Ionicons name="checkmark-done-outline" size={16} color={colors.gray600} />}
              value={`${Math.round(driverStats.punctualityScore * 100)}%`}
              label="Ponctualité"
            />
            <StatTile
              icon={<Ionicons name="shield-checkmark-outline" size={16} color={colors.gray600} />}
              value={`${Math.round(driverStats.reliabilityScore * 100)}%`}
              label="Fiabilité"
            />
            <StatTile
              icon={<Ionicons name="car-sport-outline" size={16} color={colors.gray600} />}
              value={`${ride.seatsAvailable}`}
              label="Places dispo"
            />
          </View>
        ) : null}

        <View style={styles.card}>
          <Text variant="label">Trajet</Text>
          <Text variant="bodySmall" color={colors.gray600}>
            {ride.originLabel} → {ride.destinationLabel}
          </Text>
          <Text variant="bodySmall" color={colors.gray500}>
            Départ{' '}
            {new Date(ride.departureAt).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {driverStats ? (
          <View style={styles.card}>
            <Meter label="Fiabilité" valueRatio={driverStats.reliabilityScore} />
            <Meter label="Ponctualité" valueRatio={driverStats.punctualityScore} />
          </View>
        ) : null}

        {driverStats?.vehicle ? (
          <View style={styles.card}>
            <Text variant="label" style={styles.cardTitle}>
              Véhicule
            </Text>
            <View style={styles.vehicleRow}>
              <Ionicons name="car-sport-outline" size={20} color={colors.gray900} />
              <Text variant="bodySmall" color={colors.gray700}>
                {driverStats.vehicle.make} {driverStats.vehicle.model} · {driverStats.vehicle.color}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.scrollSpacer} />
      </Animated.ScrollView>

      <Animated.View
        style={[styles.stickyHeader, { paddingTop: insets.top, backgroundColor: stickyBg }]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Animated.View style={[styles.stickyIdentity, { opacity: identityOpacity }]}>
          <Avatar name={profile.fullName} size="sm" style={styles.stickyAvatar} />
          <Text style={styles.stickyName}>{firstName}</Text>
        </Animated.View>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        {bookingError ? (
          <Text variant="bodySmall" color={colors.error} align="center">
            {bookingError}
          </Text>
        ) : (
          <Text variant="bodySmall" color={colors.gray600} align="center">
            La contribution se règle directement avec votre conducteur.
          </Text>
        )}
        <Button
          label={`Demander une place · ${ride.contributionPerSeat} DT`}
          size="lg"
          loading={isBooking}
          disabled={(!selectedStop && !origin) || ride.seatsAvailable < 1}
          onPress={() => void requestSeat()}
          style={styles.cta}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: colors.secondary,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stickyAvatar: {
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  stickyName: {
    color: colors.white,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.md,
  },
  identity: {
    alignItems: 'center',
    marginTop: -HERO_AVATAR_PX / 2,
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
  heroAvatar: {
    borderWidth: 3,
    borderColor: colors.white,
    marginBottom: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  cardTitle: {
    marginBottom: 2,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scrollSpacer: {
    height: 120,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cta: {
    width: '100%',
  },
});
