import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, AccessibilityInfo, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Text,
  ScreenHeader,
  RoutePulseBadge,
  Icon,
  GlassSurface,
  useAppTheme,
  colors,
  spacing,
  radii,
  typography,
  type IconName,
} from '@vaya/design-system';
import { router } from 'expo-router';

const BENEFITS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'car-sport-outline',
    title: 'Votre véhicule, vérifié',
    body: 'Marque, modèle et plaque affichés sur votre profil pour rassurer vos passagers.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Documents en direct',
    body: 'Permis et assurance capturés à la caméra sur le moment — jamais depuis la galerie.',
  },
  {
    icon: 'time-outline',
    title: 'Prêt en 5 minutes',
    body: 'Trois photos et un véhicule : votre profil conducteur est activé le temps du trajet.',
  },
];

export default function BecomeDriverScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      fade.setValue(1);
      rise.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  return (
    <View style={styles.container}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}>
        <ScreenHeader onBack={() => router.back()} tone="dark" />

        <Animated.View
          style={[styles.heroBody, { opacity: fade, transform: [{ translateY: rise }] }]}
        >
          <RoutePulseBadge icon="car-sport" size="hero" tone="onNavy" />
          <Text variant="caption" color={colors.secondaryLight} style={styles.eyebrow}>
            PROFIL CONDUCTEUR
          </Text>
          <Text variant="headlineDisplay" color={colors.navyText} style={styles.headline}>
            Prenez le volant avec VAYA
          </Text>
          <Text variant="body" color={colors.navyTextMuted} style={styles.subhead}>
            Proposez vos trajets, fixez votre itinéraire et partagez les frais de route — en toute
            confiance.
          </Text>
        </Animated.View>
      </View>

      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={styles.benefits}>
          {BENEFITS.map((benefit) => (
            <GlassSurface key={benefit.title} theme={theme} radius="xl" style={styles.benefitRow}>
              <View style={[styles.benefitIcon, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name={benefit.icon} size="sm" color={theme.ink} />
              </View>
              <View style={styles.benefitTextCol}>
                <Text variant="label" color={theme.ink}>
                  {benefit.title}
                </Text>
                <Text variant="bodySmall" color={theme.inkMuted} style={styles.benefitBody}>
                  {benefit.body}
                </Text>
              </View>
            </GlassSurface>
          ))}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: theme.ink }]}
            onPress={() => router.push('/driver/onboarding/vehicle')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Commencer"
          >
            <Text variant="label" color={theme.onInk}>
              Commencer
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.secondaryBack}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Text variant="bodySmall" color={theme.inkFaint}>
              Pas maintenant
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navySurface,
  },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  heroBody: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  eyebrow: {
    marginTop: spacing.lg,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.5,
  },
  headline: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  subhead: {
    marginTop: spacing.md,
    textAlign: 'center',
    maxWidth: 300,
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    marginTop: -spacing['2xl'],
    paddingTop: spacing['2xl'],
    justifyContent: 'space-between',
  },
  benefits: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTextCol: {
    flex: 1,
    gap: 2,
  },
  benefitBody: {
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.sm,
    alignItems: 'center',
  },
  cta: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBack: {
    padding: spacing.sm,
  },
});
