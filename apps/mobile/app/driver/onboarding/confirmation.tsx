import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, RoutePulseBadge, colors, spacing, typography } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { usePublishRideMutation } from '../../../src/state/api';
import { trackEvent } from '../../../src/services/analytics/analytics';

/**
 * stitch/verification/verification-confirmation-pending-state.html.
 * Reached only when the driver just finished onboarding *from* the publish
 * flow's review screen (a draft ride already exists) — see
 * driver/publish.tsx's startVerification + selfie.tsx's submit(). Stitch's
 * copy describes an async admin-review wait; this codebase's
 * `createOnboarding` auto-approves synchronously (locked product decision,
 * see verificationGate.ts), so the only real wait here is this screen's own
 * publish call — shown honestly as a brief in-flight state rather than a
 * multi-day review promise.
 */
export default function VerificationConfirmationScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { rideId, originLabel, destinationLabel } = useLocalSearchParams<{
    rideId?: string;
    originLabel?: string;
    destinationLabel?: string;
  }>();
  const [publishRide] = usePublishRideMutation();
  const [status, setStatus] = useState<'publishing' | 'done' | 'error'>('publishing');

  useEffect(() => {
    let cancelled = false;
    if (!rideId) {
      setStatus('error');
      return;
    }
    void publishRide(rideId)
      .unwrap()
      .then(() => {
        if (!cancelled) setStatus('done');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        trackEvent('ride_auto_publish_after_verification_failed', { rideId });
      });
    return () => {
      cancelled = true;
    };
  }, [rideId, publishRide]);

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.badgeWrap, { transform: [{ scale: pulse }] }]}>
          <RoutePulseBadge icon="shield-checkmark" size="hero" tone="onCream" />
        </Animated.View>

        <Text variant="h2" align="center" style={styles.title}>
          C&apos;est presque prêt !
        </Text>
        <Text variant="body" color={colors.gray600} align="center" style={styles.subtitle}>
          Votre profil conducteur vient d&apos;être vérifié.{' '}
          {originLabel && destinationLabel
            ? `Votre trajet de ${originLabel} vers ${destinationLabel} `
            : 'Votre trajet '}
          {status === 'error'
            ? "n'a pas pu être publié automatiquement — retrouvez-le en brouillon dans Mes Trajets."
            : 'est en cours de publication automatique.'}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label="Aller à Mes Trajets"
          size="lg"
          loading={status === 'publishing'}
          onPress={() => router.replace('/(tabs)/trips')}
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
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  badgeWrap: {
    marginBottom: spacing.xl,
  },
  title: {
    fontWeight: typography.fontWeight.bold,
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
  },
});
