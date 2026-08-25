import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing, AccessibilityInfo, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text, Icon, useAppTheme, spacing, radii, colors } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';

const BADGE_SIZE = 84;
const RING_SIZE = 84;

/**
 * stitch/verification/verification-confirmation-pending-state.html.
 * Reached only when the driver just finished onboarding *from* the publish
 * flow's review screen (see driver/publish.tsx's startVerification and
 * selfie.tsx's submit(), which already did the actual create-ride/publish
 * work before navigating here — `status` reports what really happened, so
 * this screen never claims a success that didn't occur). Stitch's copy
 * describes an async admin-review wait; this codebase's `createOnboarding`
 * auto-approves synchronously (see verificationGate.ts), so there is no
 * real waiting left to do by the time this screen renders.
 *
 * Pulse/ring treatment mirrors bookings/confirmed.tsx's hand-built pattern
 * (the established convention for this kind of moment across the rebuilt
 * screens) — amber/`colors.warning`, not `theme.accent`, since this is a
 * "pending verification" status, not a success state, and `AppPalette` has
 * no dedicated pending/warning role yet.
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
  const failed = status === 'error';

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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={styles.badgeWrap}>
          <Animated.View
            style={[
              styles.ring,
              {
                borderColor: colors.warning,
                transform: [{ scale: ringScale }],
                opacity: ringOpacity,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.badge,
              { backgroundColor: colors.warningLight, transform: [{ scale: badgeScale }] },
            ]}
          >
            <Icon name="shield-checkmark" size="lg" color={colors.warningDark} />
          </Animated.View>
        </View>

        <Text variant="headlineDisplay" color={theme.ink} align="center" style={styles.title}>
          {failed ? t('onboarding.confirmation.errorTitle') : t('onboarding.confirmation.successTitle')}
        </Text>
        <Text variant="body" color={theme.inkMuted} align="center" style={styles.subtitle}>
          {failed
            ? originLabel && destinationLabel
              ? `${t('onboarding.confirmation.errorDescription')} ${t('onboarding.confirmation.publishError')}`
              : t('onboarding.confirmation.errorDescription')
            : originLabel && destinationLabel
              ? `${t('onboarding.confirmation.publishSuccess')} ${t('onboarding.confirmation.successDescription')}`
              : t('onboarding.confirmation.successDescription')}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: theme.ink }]}
          onPress={() => router.replace('/(tabs)/trips')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.confirmation.successCta')}
        >
          <Icon name="time-outline" size="sm" color={theme.onInk} />
          <Text variant="label" color={theme.onInk}>
            {t('onboarding.confirmation.successCta')}
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
