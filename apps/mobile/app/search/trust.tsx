import { useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Image, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Text,
  Avatar,
  Icon,
  Button,
  Chip,
  FactRow,
  RatingBreakdown,
  VerificationSeal,
  LicensePlate,
  ScreenHeader,
  SkeletonBlock,
  StateView,
  useAppTheme,
  useReducedMotion,
  spacing,
  radii,
  type Fact,
  type VerificationCheck,
  type IconName,
} from '@vaya/design-system';
import type { SupportedLocale } from '@vaya/config';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useGetUserPublicProfileQuery,
  useGetUserTrustSummaryQuery,
  useGetConversationByBookingQuery,
} from '../../src/state/api';
import { trackEvent } from '../../src/services/analytics/analytics';
import { formatDate, formatNumber, toIntlTag } from '../../src/utils/localeFormat';
import { buildTrustProfileModel, type TrustStat } from '../../src/features/search/trustProfileModel';

const AVATAR_SIZE = 112;

const TIER_ICON: Record<'new' | 'trusted' | 'top_rated', IconName> = {
  new: 'sparkles',
  trusted: 'shield-checkmark',
  top_rated: 'ribbon',
};
const TIER_LABEL_KEY = {
  new: 'search:trust.tierNew',
  trusted: 'search:trust.tierTrusted',
  top_rated: 'search:trust.tierTopRated',
} as const;

/**
 * The one "view someone's profile" screen — a rider looking at a driver
 * before booking (search/results.tsx, ride-details), and a driver looking
 * at a passenger who asked for a seat (RequestDetailSheet, ride hub).
 *
 * Read top to bottom in the order a passenger decides: who is this and is
 * VAYA vouching for them (hero), how much track record they have (the
 * numbers, or a welcome when there is none yet), what VAYA checked, who
 * they are in their own words, which car to look for, and finally how the
 * ratings spread. No cards around everything — whitespace and small
 * section labels carry the structure; only the content that needs a
 * surface (the welcome, the car) gets one.
 *
 * What each section shows is decided by `buildTrustProfileModel` from real
 * API data only: a number that doesn't exist yet is left out, never shown
 * as "—"; "Vérifié" requires an admin-approved verification; comments stay
 * private (counts only).
 *
 * Messaging is booking-scoped (Phase 8): enabled once a conversation
 * really exists for `bookingId` (created when the booking is accepted).
 */
export default function TrustScreen(): React.JSX.Element {
  const { driverUserId, bookingId } = useLocalSearchParams<{
    rideId: string;
    driverUserId: string;
    bookingId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const { t, i18n } = useTranslation(['search', 'common']);
  const locale = i18n.language as SupportedLocale;
  const reduceMotion = useReducedMotion();
  const reveal = useRef(new Animated.Value(0)).current;

  const { data: profile, isLoading: isProfileLoading } = useGetUserPublicProfileQuery(driverUserId);
  const { data: trustSummary, isLoading: isSummaryLoading } = useGetUserTrustSummaryQuery(driverUserId);
  const { data: conversation } = useGetConversationByBookingQuery(bookingId ?? '', { skip: !bookingId });

  useEffect(() => {
    if (trustSummary?.driver) {
      trackEvent('trust_tier_shown', { screen: 'trust', tier: trustSummary.driver.tier });
    }
  }, [trustSummary]);

  const ready = Boolean(profile);
  useEffect(() => {
    if (!ready) return;
    if (reduceMotion) {
      reveal.setValue(1);
      return;
    }
    Animated.timing(reveal, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [ready, reduceMotion, reveal]);

  const header = (
    <ScreenHeader
      topInset={insets.top}
      onBack={() => router.back()}
      backLabel={t('common:actions.back')}
      title={t('search:trust.title')}
    />
  );

  if (isProfileLoading || !profile) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {header}
        {isProfileLoading ? (
          <StateView status="loading" skeleton="detail" />
        ) : (
          <StateView
            status="error"
            iconName="person-outline"
            title={t('search:trust.profileNotFound')}
            actionLabel={t('common:actions.back')}
            onAction={() => router.back()}
          />
        )}
      </View>
    );
  }

  const model = buildTrustProfileModel(profile, trustSummary);
  const firstName = profile.fullName.split(' ')[0]!;
  const driver = profile.driver;
  const memberSince = formatDate(new Date(profile.memberSince), locale, { month: 'short', year: 'numeric' });
  const ratingLabel = new Intl.NumberFormat(toIntlTag(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(model.ratingAvg);
  const canMessage = Boolean(conversation);

  const roleLine =
    model.kind === 'rider'
      ? t('search:trust.roleRider')
      : model.verified
        ? t('search:trust.roleDriverVerified')
        : t('search:trust.roleDriverPending');
  const subtitle = [roleLine, model.tenureInHeader ? t('search:trust.memberSince', { date: memberSince }) : null]
    .filter(Boolean)
    .join(' · ');

  function statFact(stat: TrustStat): Fact {
    switch (stat) {
      case 'rating':
        return {
          value: ratingLabel,
          icon: 'star',
          caption: `${formatNumber(model.ratingCount, locale)} ${t('search:trust.reviewsCaption', { count: model.ratingCount })}`,
        };
      case 'trips':
        return { value: formatNumber(model.tripCount, locale), caption: t('search:trust.tripsCaption', { count: model.tripCount }) };
      case 'punctuality':
        return { value: `${Math.round((model.punctuality ?? 0) * 100)} %`, caption: t('search:trust.punctualityCaption') };
      case 'tenure':
        return { value: memberSince, caption: t('search:trust.memberSinceCaption') };
    }
  }

  const sealChecks: VerificationCheck[] = [
    { icon: 'person-outline', label: t('search:trust.sealIdentity') },
    { icon: 'card-outline', label: t('search:trust.sealLicense') },
    ...(driver?.vehicle ? [{ icon: 'car-sport-outline' as IconName, label: t('search:trust.sealVehicle') }] : []),
  ];

  // The driver's numbers come with the public profile, but the rating
  // count/breakdown arrive with the trust summary — hold the strip's
  // place instead of letting it jump in a beat later.
  const statsLoading = isSummaryLoading && !trustSummary && !model.isNew;

  function openConversation(): void {
    if (!bookingId) return;
    router.push(`/conversations/${bookingId}`);
  }

  const sectionTitle = (label: string) => (
    <Text variant="caption" color={theme.inkFaint} style={styles.sectionTitle}>
      {label}
    </Text>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {header}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: reveal,
              transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            },
          ]}
        >
          {/* Hero — who, and whether VAYA vouches for them. */}
          <View style={styles.hero}>
            <View
              style={[
                styles.avatarRing,
                { borderColor: model.verified ? theme.accent : theme.outlineVariant },
              ]}
            >
              <Avatar uri={profile.avatarUrl} name={profile.fullName} sizePx={AVATAR_SIZE} />
              {model.verified ? (
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={t('search:trust.verifiedA11y')}
                  style={[styles.verifiedBadge, { backgroundColor: theme.accent, borderColor: theme.background }]}
                >
                  <Icon name="checkmark" size="sm" color={theme.onAccent} />
                </View>
              ) : null}
            </View>

            <Text variant="displaySmall" color={theme.ink} align="center" accessibilityRole="header">
              {firstName}
            </Text>
            <Text variant="bodySmall" color={theme.inkMuted} align="center">
              {subtitle}
            </Text>

            {model.tier || model.reliable ? (
              <View style={styles.chips}>
                {model.tier ? (
                  <Chip
                    label={t(TIER_LABEL_KEY[model.tier])}
                    tone={model.tier === 'new' ? 'dim' : 'default'}
                    icon={<Icon name={TIER_ICON[model.tier]} size="xs" color={theme.accentStrong} />}
                  />
                ) : null}
                {model.reliable ? (
                  <Chip
                    label={t('search:trust.reliable')}
                    icon={<Icon name="thumbs-up" size="xs" color={theme.accentStrong} />}
                  />
                ) : null}
              </View>
            ) : null}

            {driver?.languages && driver.languages.length > 0 ? (
              <View style={styles.languages}>
                <Icon name="language-outline" size="xs" color={theme.inkFaint} />
                <Text variant="caption" color={theme.inkFaint}>
                  {t('search:trust.speaks', { languages: driver.languages.join(', ') })}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Track record — or a welcome when there isn't one yet. */}
          {statsLoading ? (
            <SkeletonBlock height={64} radius="lg" />
          ) : model.stats.length > 0 ? (
            <View style={[styles.statsBand, { borderColor: theme.outlineVariant }]}>
              <FactRow size="lg" facts={model.stats.map(statFact)} />
            </View>
          ) : null}

          {model.isNew ? (
            <View style={[styles.welcome, { backgroundColor: theme.accentGlow + '40' }]}>
              <View style={[styles.welcomeIcon, { backgroundColor: theme.accent }]}>
                <Icon name="sparkles" size="sm" color={theme.onAccent} />
              </View>
              <View style={styles.welcomeText}>
                <Text variant="label" color={theme.ink}>
                  {t('search:trust.welcomeTitle', { name: firstName })}
                </Text>
                <Text variant="bodySmall" color={theme.inkMuted}>
                  {/* "Profil vérifié" only when it's true — a driver under review gets the neutral line. */}
                  {model.verified ? t('search:trust.welcomeBodyDriver') : t('search:trust.welcomeBodyRider')}
                </Text>
              </View>
            </View>
          ) : null}

          {/* What VAYA checked — the strongest signal a new driver has. */}
          {model.verified ? (
            <View style={styles.section}>
              {sectionTitle(t('search:trust.verifiedByVaya'))}
              <VerificationSeal
                checks={sealChecks}
                accessibilityLabel={t('search:trust.sealA11y', { checks: sealChecks.map((c) => c.label).join(', ') })}
              />
            </View>
          ) : model.verificationPending ? (
            <View style={[styles.pendingRow, { backgroundColor: theme.warningMuted }]}>
              <Icon name="time-outline" size="sm" color={theme.warning} />
              <Text variant="bodySmall" color={theme.ink} style={styles.flex}>
                {t('search:trust.verificationPending', { name: firstName })}
              </Text>
            </View>
          ) : null}

          {driver?.bio ? (
            <View style={styles.section}>
              {sectionTitle(t('search:trust.aboutTitle'))}
              <View style={[styles.quote, { borderStartColor: theme.accentGlow }]}>
                <Text variant="body" color={theme.ink}>
                  {driver.bio}
                </Text>
              </View>
            </View>
          ) : null}

          {driver?.vehicle ? (
            <View style={styles.section}>
              {sectionTitle(t('search:trust.vehicleTitle'))}
              <View style={[styles.vehicle, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
                {driver.vehicle.photoUrl ? (
                  <Image
                    source={{ uri: driver.vehicle.photoUrl }}
                    accessibilityRole="image"
                    accessibilityLabel={t('search:trust.vehiclePhotoA11y')}
                    style={[styles.vehiclePhoto, { backgroundColor: theme.surfaceMuted }]}
                    resizeMode="cover"
                  />
                ) : null}
                <View style={styles.vehicleBody}>
                  {driver.vehicle.photoUrl ? null : (
                    <View style={[styles.vehicleIcon, { backgroundColor: theme.surfaceMuted }]}>
                      <Icon name="car-sport" size="md" color={theme.inkMuted} />
                    </View>
                  )}
                  <View style={styles.vehicleText}>
                    <Text variant="title" color={theme.ink} numberOfLines={2}>
                      {`${driver.vehicle.make} ${driver.vehicle.model}`}
                    </Text>
                    <Text variant="bodySmall" color={theme.inkMuted}>
                      {driver.vehicle.color}
                    </Text>
                    <View style={styles.plateRow}>
                      <LicensePlate
                        plate={driver.vehicle.plateNumber}
                        accessibilityLabel={t('search:trust.plateA11y', { plate: driver.vehicle.plateNumber })}
                      />
                    </View>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {model.reviews !== 'none' ? (
            <View style={styles.section}>
              {sectionTitle(t('search:trust.reviewsTitle'))}
              {model.reviews === 'breakdown' ? (
                <>
                  <RatingBreakdown
                    average={model.ratingAvg}
                    averageLabel={ratingLabel}
                    countLabel={`${formatNumber(model.ratingCount, locale)} ${t('search:trust.reviewsCaption', { count: model.ratingCount })}`}
                    starCounts={model.starCounts}
                    accessibilityLabel={t('search:trust.reviewsA11y', { average: ratingLabel, count: model.ratingCount })}
                  />
                  <View style={styles.privacyRow}>
                    <Icon name="lock-closed-outline" size="xs" color={theme.inkFaint} />
                    <Text variant="caption" color={theme.inkFaint} style={styles.flex}>
                      {t('search:trust.reviewsPrivate')}
                    </Text>
                  </View>
                </>
              ) : (
                <Text variant="bodySmall" color={theme.inkMuted}>
                  {t('search:trust.reviewsEmpty', { name: firstName })}
                </Text>
              )}
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.outlineVariant, paddingBottom: insets.bottom + spacing.sm }]}>
        <Button
          size="lg"
          icon="chatbubble-outline"
          label={t('common:actions.message')}
          onPress={openConversation}
          disabled={!canMessage}
        />
        {!canMessage ? (
          <Text variant="caption" color={theme.inkFaint} align="center">
            {model.kind === 'driver' ? t('search:trust.messageAvailability') : t('search:trust.messageAvailabilityDriver')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  content: {
    gap: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  avatarRing: {
    padding: 4,
    borderWidth: 2,
    borderRadius: AVATAR_SIZE / 2 + 6,
    marginBottom: spacing.sm,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  languages: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  statsBand: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
  },
  welcome: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  welcomeIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    flex: 1,
    gap: spacing.xs,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  quote: {
    borderStartWidth: 3,
    paddingStart: spacing.md,
  },
  vehicle: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  vehiclePhoto: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  vehicleBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  vehicleIcon: {
    alignSelf: 'flex-start',
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleText: {
    flex: 1,
    gap: 2,
  },
  plateRow: {
    marginTop: spacing.sm,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
});
