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
 *  can exist before a booking is even requested.
 *
 *  New-driver experience: a driver with zero completed trips would
 *  otherwise render as "0.0 ★ / 0 trajets" stat tiles and a reviews link
 *  into fabricated content — reading as a red flag when it's really just a
 *  beginning. Instead, everything shown stays real (public profile +
 *  trust-summary keyed by the tapped ride's driverUserId) and the empty
 *  history is reframed honestly: a warm welcome panel naming what IS
 *  verified, a checklist of the actual VAYA vetting steps, and review-copy
 *  that asks the passenger to be the first to share their experience after
 *  the trip — encouraging both the booking and the review, never
 *  fabricating either. */
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
  // tripCount === 0 alone determines the brand-new experience — it implies
  // tier 'new' (≤4 trips), and comes straight from the public profile so the
  // layout doesn't flash the stat-tile version while trust-summary loads.
  const tripCount = driverStats?.tripCount ?? 0;
  const isBrandNew = driverStats != null && tripCount === 0;
  const isNewTier = trustSummary?.driver?.tier === 'new';
  const ratingLabel =
    driverStats && (driverStats.ratingAvg ?? 0) > 0 ? driverStats.ratingAvg.toFixed(1) : '—';

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

        {driverStats && !isBrandNew ? (
          <View style={styles.statsRow}>
            <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <View style={styles.statValueRow}>
                <Text variant="h3" color={theme.ink}>
                  {ratingLabel}
                </Text>
                <Icon name="star" size="xs" color={theme.accent} />
              </View>
              <Text variant="caption" color={theme.inkFaint}>
                Note
              </Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <Text variant="h3" color={theme.ink}>
                {tripCount}
              </Text>
              <Text variant="caption" color={theme.inkFaint}>
                Trajets
              </Text>
            </View>
          </View>
        ) : null}

        {isBrandNew ? (
          <View
            style={[
              styles.welcomeCard,
              { backgroundColor: theme.accent + '12', borderColor: theme.accent + '38' },
            ]}
          >
            <View style={styles.welcomeTitleRow}>
              <View style={[styles.welcomeIconWrap, { backgroundColor: theme.accent }]}>
                <Icon name="sparkles" size="sm" color={theme.onAccent} />
              </View>
              <Text variant="label" color={theme.ink}>
                {`${firstName} débute sur VAYA`}
              </Text>
            </View>
            <Text variant="bodySmall" color={theme.inkMuted}>
              {`Profil entièrement vérifié, encore sans trajets ni avis — tout le monde débute un jour. Ce que VAYA garantit déjà se trouve ci-dessous.`}
            </Text>
            <View style={styles.encourageRow}>
              <Icon name="heart" size="xs" color={theme.accent} />
              <Text variant="bodySmall" color={theme.ink}>
                {`Soyez parmi les premiers passagers de ${firstName} : votre avis après le trajet l’aidera à démarrer en confiance.`}
              </Text>
            </View>
          </View>
        ) : null}

        {driverStats ? (
          <View style={styles.pillsRow}>
            {isNewTier ? (
              <View style={[styles.pill, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="sparkles" size="xs" color={theme.accent} />
                <Text variant="bodySmall" color={theme.ink}>
                  Nouveau
                </Text>
              </View>
            ) : null}
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

        {driverStats ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <View style={styles.cardTitleRow}>
              <Icon name="shield-checkmark-outline" size="sm" color={theme.accent} />
              <Text variant="label" color={theme.ink}>
                Vérifications VAYA
              </Text>
            </View>
            <View style={styles.verifyRow}>
              <Icon name="person-circle-outline" size="sm" color={theme.accent} />
              <Text variant="bodySmall" color={theme.inkMuted}>
                Identité confirmée par selfie
              </Text>
            </View>
            <View style={styles.verifyRow}>
              <Icon name="document-text-outline" size="sm" color={theme.accent} />
              <Text variant="bodySmall" color={theme.inkMuted}>
                Documents de conduite contrôlés
              </Text>
            </View>
            {driverStats.vehicle ? (
              <View style={styles.verifyRow}>
                <Icon name="car-sport-outline" size="sm" color={theme.accent} />
                <Text variant="bodySmall" color={theme.inkMuted}>
                  Véhicule enregistré — plaque visible ci-dessous
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
          tripCount > 0 ? (
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
          ) : (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <View style={styles.cardTitleRow}>
                <Icon name="chatbubble-ellipses-outline" size="sm" color={theme.inkFaint} />
                <Text variant="label" color={theme.ink} style={styles.reviewsTitle}>
                  Avis
                </Text>
              </View>
              <Text variant="bodySmall" color={theme.inkMuted}>
                {`${firstName} n’a pas encore reçu d’avis.`}
              </Text>
              <Text variant="bodySmall" color={theme.accent} style={styles.firstReviewLine}>
                {`Après votre trajet, partagez le vôtre — le premier avis est celui qui compte le plus.`}
              </Text>
            </View>
          )
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
  welcomeCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  welcomeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  welcomeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  encourageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
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
  firstReviewLine: {
    fontWeight: '600',
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
