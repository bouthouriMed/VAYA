import { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar, Icon, useAppTheme, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useGetUserPublicProfileQuery, useGetUserTrustSummaryQuery } from '../../src/state/api';
import { trackEvent } from '../../src/services/analytics/analytics';

// Real reliabilityScore threshold for the "Fiable" pill — chosen once here
// rather than hardcoded inline so the rationale lives in one place: below
// this, a driver isn't lying about being unreliable, but this screen
// shouldn't actively vouch for them as a highlight either.
const RELIABLE_THRESHOLD = 0.85;

/** Stitch's "Driver Profile" — pure trust/vetting content. The actual
 *  booking request lives on search/ride-details.tsx (reached *before* this
 *  screen, from results.tsx); this screen is reached by tapping the driver
 *  row there, and its own footer action is "Message Driver" — rendered
 *  disabled since messaging is booking-scoped (Phase 8) and no conversation
 *  can exist before a booking is even requested. */
export default function TrustScreen(): React.JSX.Element {
  const { driverUserId } = useLocalSearchParams<{ rideId: string; driverUserId: string }>();
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();

  const { data: profile, isLoading: isProfileLoading } = useGetUserPublicProfileQuery(driverUserId);
  const { data: trustSummary } = useGetUserTrustSummaryQuery(driverUserId);

  useEffect(() => {
    if (trustSummary?.driver) {
      trackEvent('trust_tier_shown', { screen: 'trust', tier: trustSummary.driver.tier });
    }
  }, [trustSummary]);

  if (isProfileLoading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <Text variant="body" color={theme.inkFaint}>
          Profil introuvable.
        </Text>
      </View>
    );
  }

  const firstName = profile.fullName.split(' ')[0]!;
  const driverStats = profile.driver;
  const isTopRated = trustSummary?.driver?.tier === 'top_rated';
  const isReliable = (driverStats?.reliabilityScore ?? 0) >= RELIABLE_THRESHOLD;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, backgroundColor: theme.surface, borderBottomColor: theme.outlineVariant }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text variant="h3" color={theme.ink}>
          Vaya
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <View style={styles.avatarWrap}>
            <Avatar uri={profile.avatarUrl} name={profile.fullName} sizePx={104} style={{ borderWidth: 3, borderColor: theme.surface }} />
            {driverStats ? (
              <View style={[styles.verifiedBadge, { backgroundColor: theme.accent, borderColor: theme.surface }]}>
                <Icon name="checkmark" size="xs" color={theme.onAccent} />
              </View>
            ) : null}
          </View>
          <View style={styles.nameRow}>
            <Text variant="h2" color={theme.ink}>
              {firstName}
            </Text>
            {driverStats ? (
              <View style={[styles.verifiedPill, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="shield-checkmark" size="xs" color={theme.inkMuted} />
                <Text variant="caption" color={theme.inkMuted}>
                  Vérifié
                </Text>
              </View>
            ) : null}
          </View>
          {driverStats?.languages && driverStats.languages.length > 0 ? (
            <Text variant="bodySmall" color={theme.inkFaint}>
              Parle {driverStats.languages.join(', ')}
            </Text>
          ) : null}
        </View>

        {driverStats ? (
          <View style={styles.statsRow}>
            <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <View style={styles.statValueRow}>
                <Text variant="h3" color={theme.ink}>
                  {driverStats.ratingAvg.toFixed(1)}
                </Text>
                <Icon name="star" size="xs" color={theme.accent} />
              </View>
              <Text variant="caption" color={theme.inkFaint}>
                Note
              </Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <Text variant="h3" color={theme.ink}>
                {driverStats.tripCount}
              </Text>
              <Text variant="caption" color={theme.inkFaint}>
                Trajets
              </Text>
            </View>
          </View>
        ) : null}

        {driverStats && (isReliable || isTopRated) ? (
          <View style={styles.pillsRow}>
            {isReliable ? (
              <View style={[styles.pill, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="thumbs-up" size="xs" color={theme.accent} />
                <Text variant="bodySmall" color={theme.ink}>
                  Fiable
                </Text>
              </View>
            ) : null}
            {isTopRated ? (
              <View style={[styles.pill, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="ribbon-outline" size="xs" color={theme.accent} />
                <Text variant="bodySmall" color={theme.ink}>
                  Top VAYA
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {driverStats?.bio ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <View style={styles.cardTitleRow}>
              <Icon name="information-circle-outline" size="sm" color={theme.inkFaint} />
              <Text variant="label" color={theme.ink}>
                À propos de {firstName}
              </Text>
            </View>
            <Text variant="bodySmall" color={theme.inkMuted}>
              {driverStats.bio}
            </Text>
          </View>
        ) : null}

        {driverStats?.vehicle ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <View style={styles.cardTitleRow}>
              <Icon name="car-sport-outline" size="sm" color={theme.inkFaint} />
              <Text variant="label" color={theme.ink}>
                Véhicule
              </Text>
            </View>
            <View style={styles.vehicleRow}>
              <View>
                <Text variant="body" color={theme.ink} style={styles.vehicleName}>
                  {driverStats.vehicle.color} {driverStats.vehicle.make} {driverStats.vehicle.model}
                </Text>
                <View style={[styles.platePill, { backgroundColor: theme.background, borderColor: theme.outlineVariant }]}>
                  <Text variant="caption" color={theme.inkMuted} style={styles.plateText}>
                    {driverStats.vehicle.plateNumber}
                  </Text>
                </View>
              </View>
              <View style={[styles.vehicleIconWrap, { backgroundColor: theme.background, borderColor: theme.outlineVariant }]}>
                <Icon name="car-sport" size="lg" color={theme.inkFaint} />
              </View>
            </View>
          </View>
        ) : null}

        {driverStats ? (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
            onPress={() => router.push({ pathname: '/search/reviews', params: { driverUserId, driverName: profile.fullName } })}
            activeOpacity={0.8}
          >
            <View style={styles.cardTitleRow}>
              <Icon name="chatbubble-ellipses-outline" size="sm" color={theme.inkFaint} />
              <Text variant="label" color={theme.ink} style={styles.reviewsTitle}>
                Avis
              </Text>
              <Icon name="chevron-forward" size="sm" color={theme.inkFaint} />
            </View>
            <Text variant="bodySmall" color={theme.inkFaint}>
              Voir tous les avis sur {firstName}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.scrollSpacer} />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.outlineVariant, paddingBottom: insets.bottom + spacing.sm }]}>
        {/* Messaging is booking-scoped (Phase 8) — a conversation is only
         *  created once a booking reaches `accepted`, so there is no real
         *  backend path for messaging a driver before a seat is even
         *  requested. Rendered as the design's solid "Message Driver" pill,
         *  just disabled, rather than wired to nothing. */}
        <View style={[styles.cta, styles.ctaDisabled, { backgroundColor: theme.ink }]}>
          <Icon name="chatbubble-outline" size="sm" color={theme.onInk} />
          <Text variant="label" color={theme.onInk}>
            Message conducteur
          </Text>
        </View>
        <Text variant="caption" color={theme.inkFaint} align="center">
          Disponible une fois votre demande de place acceptée.
        </Text>
      </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  identity: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarWrap: {
    position: 'relative',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingVertical: spacing.md,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reviewsTitle: {
    flex: 1,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vehicleName: {
    fontWeight: '600',
  },
  platePill: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  plateText: {
    letterSpacing: 1.5,
  },
  vehicleIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollSpacer: {
    height: 100,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  cta: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.full,
    paddingVertical: spacing.md,
  },
  ctaDisabled: {
    opacity: 0.4,
  },
});
