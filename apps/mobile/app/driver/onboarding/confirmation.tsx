import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, RoutePulseBadge, colors, spacing, typography } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';

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
 */
export default function VerificationConfirmationScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { originLabel, destinationLabel, status } = useLocalSearchParams<{
    originLabel?: string;
    destinationLabel?: string;
    status?: 'done' | 'error';
  }>();
  const failed = status === 'error';

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
          {failed ? 'Profil vérifié' : "C'est presque prêt !"}
        </Text>
        <Text variant="body" color={colors.gray600} align="center" style={styles.subtitle}>
          Votre profil conducteur vient d&apos;être vérifié.{' '}
          {failed
            ? originLabel && destinationLabel
              ? `Votre trajet de ${originLabel} vers ${destinationLabel} n'a pas pu être publié automatiquement — retrouvez-le en brouillon dans Mes Trajets.`
              : "Votre trajet n'a pas pu être publié automatiquement — retrouvez-le en brouillon dans Mes Trajets."
            : originLabel && destinationLabel
              ? `Votre trajet de ${originLabel} vers ${destinationLabel} vient d'être publié.`
              : 'Vous pouvez maintenant publier des trajets.'}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label="Aller à Mes Trajets"
          size="lg"
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
