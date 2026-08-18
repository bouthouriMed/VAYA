import { useRef } from 'react';
import { Animated, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  Button,
  Avatar,
  Chip,
  Meter,
  ReviewCard,
  StatTile,
  colors,
  spacing,
  radii,
  typography,
} from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { getDriverByKey, HOME_TO_DIGITAL_CENTER } from '../../src/mocks/seed-data';

const HERO_HEIGHT = 200;
const HERO_AVATAR_PX = 108;
const STICKY_THRESHOLD = 120;

export default function TrustScreen(): React.JSX.Element {
  const { driverId } = useLocalSearchParams<{ driverId?: string }>();
  const driver = getDriverByKey(driverId);
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  // The hero cover starts transparent so the sticky bar reads as a plain nav
  // button at the top; scrolling past the identity block reveals the same
  // sage cover color behind a compact avatar+name, giving a persistent
  // "who am I looking at" context without needing a real cover photo asset.
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

  const firstName = driver.fullName.split(' ')[0]!;

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
          <Avatar name={driver.fullName} sizePx={HERO_AVATAR_PX} style={styles.heroAvatar} />
          <View style={styles.nameRow}>
            <Text variant="h2">{firstName}</Text>
            {driver.idVerified ? (
              <Ionicons name="checkmark-circle" size={20} color={colors.secondary} />
            ) : null}
          </View>
          <Text variant="body" color={colors.gray600}>
            ★ {driver.ratingAvg.toFixed(1)} · {driver.ratingsCount} avis · {driver.tripCount}{' '}
            trajets
          </Text>
        </View>

        <View style={styles.statsRow}>
          <StatTile
            icon={<Ionicons name="flash-outline" size={16} color={colors.gray600} />}
            value={`${Math.round(driver.responseRate * 100)}%`}
            label="Réponse"
          />
          <StatTile
            icon={<Ionicons name="close-circle-outline" size={16} color={colors.gray600} />}
            value={`${Math.round(driver.cancellationRate * 100)}%`}
            label="Annulation"
          />
          <StatTile
            icon={<Ionicons name="calendar-outline" size={16} color={colors.gray600} />}
            value={driver.memberSince.split(' ')[1] ?? driver.memberSince}
            label="Membre depuis"
          />
        </View>

        {driver.badges.length > 0 ? (
          <View style={styles.chipRow}>
            {driver.badges.map((b) => (
              <Chip key={b} label={b} />
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text variant="label">Trajet habituel</Text>
          <Text variant="bodySmall" color={colors.gray600}>
            {HOME_TO_DIGITAL_CENTER.originLabel} → {HOME_TO_DIGITAL_CENTER.destinationLabel}
          </Text>
          {driver.mutualContext ? (
            <Chip label={`Contexte partagé : ${driver.mutualContext}`} style={styles.mutualChip} />
          ) : null}
        </View>

        <View style={styles.card}>
          <Meter label="Fiabilité" valueRatio={driver.reliabilityScore} />
          <Meter label="Ponctualité" valueRatio={driver.punctualityScore} />
        </View>

        {driver.preferences.length > 0 ? (
          <View style={styles.card}>
            <Text variant="label" style={styles.cardTitle}>
              Préférences de trajet
            </Text>
            <View style={styles.chipRow}>
              {driver.preferences.map((p) => (
                <Chip key={p} label={p} tone="dim" />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text variant="label" style={styles.cardTitle}>
            Véhicule
          </Text>
          <View style={styles.vehicleRow}>
            <Ionicons name="car-sport-outline" size={20} color={colors.gray900} />
            <Text variant="bodySmall" color={colors.gray700}>
              {driver.vehicle.make} {driver.vehicle.model} · {driver.vehicle.color}
            </Text>
          </View>
          {driver.languages.length > 0 ? (
            <Text variant="bodySmall" color={colors.gray500} style={styles.languages}>
              Parle {driver.languages.join(', ')}
            </Text>
          ) : null}
        </View>

        {driver.reviews.length > 0 ? (
          <View style={styles.reviewsSection}>
            <Text variant="label" style={styles.cardTitle}>
              Avis récents
            </Text>
            {driver.reviews.map((review, i) => (
              <ReviewCard key={i} review={review} />
            ))}
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
          <Avatar name={driver.fullName} size="sm" style={styles.stickyAvatar} />
          <Text style={styles.stickyName}>{firstName}</Text>
        </Animated.View>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Text variant="bodySmall" color={colors.gray600} align="center">
          La contribution se règle directement avec votre conducteur.
        </Text>
        <Button
          label={`Demander une place · ${driver.priceDt ?? 5} DT`}
          size="lg"
          onPress={() =>
            router.dismissTo({ pathname: '/bookings/confirmed', params: { driverId } })
          }
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
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
  mutualChip: {
    marginTop: spacing.xs,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  languages: {
    marginTop: 2,
  },
  reviewsSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
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
