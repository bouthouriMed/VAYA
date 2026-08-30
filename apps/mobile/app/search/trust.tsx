import { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text, Avatar, Icon, useAppTheme, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useGetUserPublicProfileQuery,
  useGetUserTrustSummaryQuery,
  useGetConversationByBookingQuery,
} from '../../src/state/api';
import { trackEvent } from '../../src/services/analytics/analytics';

// Real reliabilityScore threshold for the "Fiable" pill — chosen once here
// rather than hardcoded inline so the rationale lives in one place: below
// this, a driver isn't lying about being unreliable, but this screen
// shouldn't actively vouch for them as a highlight either. Only ever
// evaluated for a driver profile — GET /users/:id/public-profile has no
// equivalent reliabilityScore field for a rider.
const RELIABLE_THRESHOLD = 0.85;

/** Stitch's "Driver Profile," generalized into this app's one real "view
 *  someone's profile" screen — reached from search/results.tsx (rider
 *  viewing a driver, pre-booking) AND from RequestDetailSheet (a driver
 *  viewing a passenger who requested a seat). Real gap this closed: every
 *  stat/pill/verification section below was gated on `profile.driver`
 *  alone, so a passenger's own profile rendered as nothing more than an
 *  avatar and a first name — this reads whichever of `trustSummary.driver`/
 *  `trustSummary.rider` actually applies (GET /users/:id/trust-summary
 *  already computes both real TierAggregates for every user) rather than
 *  showing real data for one role and nothing at all for the other. What
 *  stays role-gated on purpose: KYC verification, bio, and vehicle are
 *  genuinely driver-only facts (riders never go through onboarding) — never
 *  fabricated for a rider just to fill the card.
 *
 *  Messaging: enabled for real (not just re-labeled) once a conversation
 *  actually exists for the `bookingId` param — Phase 8 only ever creates
 *  one once a booking reaches `accepted`, so a still-pending request keeps
 *  the honest disabled state instead of linking into nothing. */
export default function TrustScreen(): React.JSX.Element {
  const { driverUserId, bookingId } = useLocalSearchParams<{
    rideId: string;
    driverUserId: string;
    bookingId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const { t } = useTranslation(['search', 'common']);

  const { data: profile, isLoading: isProfileLoading } = useGetUserPublicProfileQuery(driverUserId);
  const { data: trustSummary } = useGetUserTrustSummaryQuery(driverUserId);
  const { data: conversation } = useGetConversationByBookingQuery(bookingId ?? '', { skip: !bookingId });

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
          {t('search:trust.profileNotFound')}
        </Text>
      </View>
    );
  }

  const firstName = profile.fullName.split(' ')[0]!;
  const driverStats = profile.driver;
  const isDriverProfile = driverStats != null;
  // Whichever real TierAggregate actually applies to the profile being
  // viewed — GET /users/:id/trust-summary computes both roles for every
  // user, so a rider being viewed still has real tier/rating/trip data,
  // not just whatever happens to sit on `trustSummary.driver`.
  const relevantTier = isDriverProfile ? trustSummary?.driver : trustSummary?.rider;
  const hasStats = isDriverProfile ? true : relevantTier != null;
  const isTopRated = relevantTier?.tier === 'top_rated';
  const isNewTier = relevantTier?.tier === 'new';
  // reliabilityScore only exists on a driver's public profile — never
  // fabricated for a rider, who simply never gets this pill.
  const isReliable = isDriverProfile && (driverStats?.reliabilityScore ?? 0) >= RELIABLE_THRESHOLD;
  // tripCount === 0 alone determines the brand-new experience. For a driver
  // this comes straight from the public profile (available immediately, no
  // flash while trust-summary loads); a rider has no equivalent field on
  // the public profile, so it waits on the real trust-summary tripCount
  // instead of guessing.
  const tripCount = isDriverProfile ? (driverStats?.tripCount ?? 0) : (relevantTier?.tripCount ?? 0);
  const isBrandNew = hasStats && tripCount === 0;
  const ratingValue = isDriverProfile ? (driverStats?.ratingAvg ?? 0) : (relevantTier?.ratingAvg ?? 0);
  const ratingLabel = ratingValue > 0 ? ratingValue.toFixed(1) : '—';
  const canMessage = Boolean(conversation);

  function openConversation(): void {
    if (!bookingId) return;
    router.push(`/conversations/${bookingId}`);
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, backgroundColor: theme.surface, borderBottomColor: theme.outlineVariant }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.back')}
        >
          <Ionicons name="chevron-back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text variant="h3" color={theme.ink}>
          {t('search:trust.title')}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <View style={styles.avatarWrap}>
            <Avatar
              uri={profile.avatarUrl}
              name={profile.fullName}
              sizePx={104}
              style={{ borderWidth: 3, borderColor: theme.surface }}
              fallbackBackgroundColor={theme.surfaceMuted}
              fallbackTextColor={theme.ink}
            />
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
                  {t('search:trust.verified')}
                </Text>
              </View>
            ) : null}
          </View>
          {driverStats?.languages && driverStats.languages.length > 0 ? (
            <Text variant="bodySmall" color={theme.inkFaint}>
              {t('search:trust.speaks', { languages: driverStats.languages.join(', ') })}
            </Text>
          ) : null}
        </View>

        {hasStats && !isBrandNew ? (
          <View style={styles.statsRow}>
            <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <View style={styles.statValueRow}>
                <Text variant="h3" color={theme.ink}>
                  {ratingLabel}
                </Text>
                <Icon name="star" size="xs" color={theme.accent} />
              </View>
              <Text variant="caption" color={theme.inkFaint}>
                {t('search:trust.ratingLabel')}
              </Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <Text variant="h3" color={theme.ink}>
                {tripCount}
              </Text>
              <Text variant="caption" color={theme.inkFaint}>
                {t('search:trust.tripsLabel')}
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
                {t('search:trust.welcomeTitle', { name: firstName })}
              </Text>
            </View>
            <Text variant="bodySmall" color={theme.inkMuted}>
              {isDriverProfile
                ? t('search:trust.welcomeDescription')
                : t('search:trust.welcomeDescriptionRider')}
            </Text>
            <View style={styles.encourageRow}>
              <Icon name="heart" size="xs" color={theme.accent} />
              <Text variant="bodySmall" color={theme.ink}>
                {isDriverProfile
                  ? t('search:trust.welcomeEncourage', { name: firstName })
                  : t('search:trust.welcomeEncourageRider', { name: firstName })}
              </Text>
            </View>
          </View>
        ) : null}

        {hasStats ? (
          <View style={styles.pillsRow}>
            {isNewTier ? (
              <View style={[styles.pill, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="sparkles" size="xs" color={theme.accent} />
                <Text variant="bodySmall" color={theme.ink}>
                  {t('search:trust.pillNew')}
                </Text>
              </View>
            ) : null}
            {isReliable ? (
              <View style={[styles.pill, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="thumbs-up" size="xs" color={theme.accent} />
                <Text variant="bodySmall" color={theme.ink}>
                  {t('search:trust.pillReliable')}
                </Text>
              </View>
            ) : null}
            {isTopRated ? (
              <View style={[styles.pill, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="ribbon-outline" size="xs" color={theme.accent} />
                <Text variant="bodySmall" color={theme.ink}>
                  {t('search:trust.pillTopRated')}
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
                {t('search:trust.verificationsTitle')}
              </Text>
            </View>
            <View style={styles.verifyRow}>
              <Icon name="person-circle-outline" size="sm" color={theme.accent} />
              <Text variant="bodySmall" color={theme.inkMuted}>
                {t('search:trust.verificationIdentity')}
              </Text>
            </View>
            <View style={styles.verifyRow}>
              <Icon name="document-text-outline" size="sm" color={theme.accent} />
              <Text variant="bodySmall" color={theme.inkMuted}>
                {t('search:trust.verificationDocuments')}
              </Text>
            </View>
            {driverStats.vehicle ? (
              <View style={styles.verifyRow}>
                <Icon name="car-sport-outline" size="sm" color={theme.accent} />
                <Text variant="bodySmall" color={theme.inkMuted}>
                  {t('search:trust.verificationVehicle')}
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
                {t('search:trust.aboutTitle', { name: firstName })}
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
                {t('common:terms.vehicle')}
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
                  {t('search:trust.reviewsTitle')}
                </Text>
                <Icon name="chevron-forward" size="sm" color={theme.inkFaint} />
              </View>
              <Text variant="bodySmall" color={theme.inkFaint}>
                {t('search:trust.reviewsSubtitle', { name: firstName })}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <View style={styles.cardTitleRow}>
                <Icon name="chatbubble-ellipses-outline" size="sm" color={theme.inkFaint} />
                <Text variant="label" color={theme.ink} style={styles.reviewsTitle}>
                  {t('search:trust.reviewsTitle')}
                </Text>
              </View>
              <Text variant="bodySmall" color={theme.inkMuted}>
                {t('search:trust.reviewsEmpty', { name: firstName })}
              </Text>
              <Text variant="bodySmall" color={theme.accent} style={styles.firstReviewLine}>
                {t('search:trust.reviewsFirstLine')}
              </Text>
            </View>
          )
        ) : null}

        <View style={styles.scrollSpacer} />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.outlineVariant, paddingBottom: insets.bottom + spacing.sm }]}>
        {/* Messaging is booking-scoped (Phase 8) — a conversation is only
         *  created once a booking this screen was opened from actually
         *  reaches `accepted`. `canMessage` is a real, queried fact (GET
         *  /conversations/:bookingId), not a guess from booking status —
         *  once it's true this is a genuine working entry into that
         *  conversation, never just a re-labeled dead button. */}
        {canMessage ? (
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: theme.accent }]}
            onPress={openConversation}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.message')}
          >
            <Icon name="chatbubble-outline" size="sm" color={theme.onAccent} />
            <Text variant="label" color={theme.onAccent}>
              {t('common:actions.message')}
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={[styles.cta, styles.ctaDisabled, { backgroundColor: theme.ink }]}>
              <Icon name="chatbubble-outline" size="sm" color={theme.onInk} />
              <Text variant="label" color={theme.onInk}>
                {t('common:actions.message')}
              </Text>
            </View>
            <Text variant="caption" color={theme.inkFaint} align="center">
              {isDriverProfile
                ? t('search:trust.messageAvailability')
                : t('search:trust.messageAvailabilityDriver')}
            </Text>
          </>
        )}
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
