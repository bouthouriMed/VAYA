import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing, AccessibilityInfo, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text, Icon, useAppTheme, haptics, spacing, radii, colors } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useGetMyDriverProfileQuery } from '../../../src/state/api';
import { verificationDeclineReasonKey } from '../../../src/features/driver-onboarding/verificationDeclineCopy';

const BADGE_SIZE = 84;
const RING_SIZE = 84;

/**
 * stitch/verification/verification-confirmation-pending-state.html.
 *
 * Rewritten for the admin verification workflow (docs/domain/
 * verification-workflow.md) — this screen used to assume `createOnboarding`
 * always synchronously auto-approved (a "locked product decision" that has
 * since been explicitly reversed), so its only real question was "did the
 * ride auto-publish succeed." That's no longer the interesting question: a
 * driver profile now genuinely sits in `pending`/`under_review` for real,
 * possibly extended review time, and can come back `resubmission_required`
 * or `rejected` — this screen is the one place the driver checks that real
 * status, so it renders it live from `useGetMyDriverProfileQuery` rather
 * than trusting a one-time `status` navigation param. The `status` param
 * (`done`/`error`) is kept only as a secondary "did the ride you were
 * trying to publish actually go through" signal, layered on top of the
 * real verification state — never allowed to imply a verification outcome
 * it doesn't back.
 */
export default function VerificationConfirmationScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const { t } = useTranslation('driver');
  const { originLabel, destinationLabel, status } = useLocalSearchParams<{
    originLabel?: string;
    destinationLabel?: string;
    status?: 'done' | 'error';
  }>();
  const { data: driverProfile, isLoading } = useGetMyDriverProfileQuery();
  const hasPendingRide = Boolean(originLabel && destinationLabel);

  const badgeScale = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.6)).current;
  const ringOpacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        badgeScale.setValue(1);
        return;
      }
      Animated.spring(badgeScale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();
      Animated.loop(
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1.9,
            duration: 1100,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 1100,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading || !driverProfile) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const verificationStatus = driverProfile.verificationStatus;
  const isApproved = verificationStatus === 'approved';
  const isResubmission = verificationStatus === 'resubmission_required';
  const isRejected = verificationStatus === 'rejected';
  // Anything else (pending | under_review) falls through to the default
  // branch in the title/subtitle derivation below.

  const badgeTone = isApproved ? colors.success : isResubmission || isRejected ? colors.error : colors.warning;
  const badgeToneLight = isApproved ? colors.successLight : isResubmission || isRejected ? colors.errorLight : colors.warningLight;
  const badgeToneDark = isApproved ? colors.successDark : isResubmission || isRejected ? colors.errorDark : colors.warningDark;
  const iconName = isApproved ? 'shield-checkmark' : isResubmission ? 'refresh' : isRejected ? 'close-circle' : 'shield-checkmark';

  let title: string;
  let subtitle: string;
  if (isApproved) {
    title = t('onboarding.confirmation.successTitle');
    subtitle =
      status === 'done' && hasPendingRide
        ? `${t('onboarding.confirmation.publishSuccess')} ${t('onboarding.confirmation.successDescription')}`
        : status === 'error' && hasPendingRide
          ? `${t('onboarding.confirmation.publishError')}`
          : t('onboarding.confirmation.successDescription');
  } else if (isResubmission) {
    title = t('onboarding.confirmation.resubmitTitle');
    subtitle =
      driverProfile.verificationDeclineMessage ??
      (driverProfile.verificationDeclineReason
        ? t(verificationDeclineReasonKey(driverProfile.verificationDeclineReason))
        : t('onboarding.confirmation.pendingDescription'));
  } else if (isRejected) {
    title = t('onboarding.confirmation.rejectedTitle');
    subtitle = driverProfile.verificationDeclineMessage ?? t('onboarding.confirmation.rejectedTitle');
  } else {
    title = t('onboarding.confirmation.pendingTitle');
    subtitle = hasPendingRide
      ? `${t('onboarding.confirmation.pendingDescription')} ${t('onboarding.confirmation.pendingRideSavedNote')}`
      : t('onboarding.confirmation.pendingDescription');
  }

  const ctaLabel = isResubmission
    ? t('onboarding.confirmation.resubmitCta')
    : isRejected
      ? t('onboarding.confirmation.backCta')
      : t('onboarding.confirmation.successCta');

  function handleCta(): void {
    if (isResubmission) {
      router.replace('/driver/onboarding/resubmit');
    } else {
      router.replace('/(tabs)/trips');
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={styles.badgeWrap}>
          <Animated.View
            style={[
              styles.ring,
              {
                borderColor: badgeTone,
                transform: [{ scale: ringScale }],
                opacity: ringOpacity,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.badge,
              { backgroundColor: badgeToneLight, transform: [{ scale: badgeScale }] },
            ]}
          >
            <Icon name={iconName} size="lg" color={badgeToneDark} />
          </Animated.View>
        </View>

        <Text variant="headlineDisplay" color={theme.ink} align="center" style={styles.title}>
          {title}
        </Text>
        <Text variant="body" color={theme.inkMuted} align="center" style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: theme.ink }]}
          onPress={() => {
            haptics.selection();
            handleCta();
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Icon name={isResubmission ? 'camera-outline' : 'time-outline'} size="sm" color={theme.onInk} />
          <Text variant="label" color={theme.onInk}>
            {ctaLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  badgeWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginBottom: spacing.sm,
  },
  subtitle: {
    maxWidth: 340,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  cta: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
