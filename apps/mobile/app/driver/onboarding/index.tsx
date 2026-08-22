import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  AccessibilityInfo,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Text,
  ScreenHeader,
  RoutePulseBadge,
  Icon,
  GlassSurface,
  useAppTheme,
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

/**
 * The driver-flow entry hero. Fully theme-following (`useAppTheme()`): both
 * modes render the same structure — a `backgroundGradient` wash with ambient
 * accent glows behind the hero (the treatment landing/otp established, here
 * in whichever scheme is live), the RoutePulseBadge motif picking its tone
 * per scheme, and the same rounded sheet seam over it — so light mode reads
 * as warm-ivory-with-emerald and dark as charcoal-emerald, one coherent
 * design rather than a fixed navy block pasted onto either theme.
 */
export default function BecomeDriverScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme, scheme } = useAppTheme();
  const isDark = scheme === 'dark';
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={theme.backgroundGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View
        pointerEvents="none"
        style={[styles.glowTop, { backgroundColor: theme.accentGlow }]}
      />
      <View
        pointerEvents="none"
        style={[styles.glowSeam, { backgroundColor: theme.accent }]}
      />

      <View style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}>
        <ScreenHeader onBack={() => router.back()} tone={isDark ? 'dark' : 'light'} />

        <Animated.View
          style={[styles.heroBody, { opacity: fade, transform: [{ translateY: rise }] }]}
        >
          <RoutePulseBadge icon="car-sport" size="hero" tone={isDark ? 'onNavy' : 'onCream'} />
          <Text variant="caption" color={theme.accent} style={styles.eyebrow}>
            PROFIL CONDUCTEUR
          </Text>
          <Text variant="headlineDisplay" color={theme.ink} style={styles.headline}>
            Prenez le volant avec VAYA
          </Text>
          <Text variant="body" color={theme.inkMuted} style={styles.subhead}>
            Proposez vos trajets, fixez votre itinéraire et partagez les frais de route — en toute
            confiance.
          </Text>
        </Animated.View>
      </View>

      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.background, borderTopColor: theme.outline },
        ]}
      >
        <View style={styles.benefits}>
          {BENEFITS.map((benefit) => (
            <GlassSurface
              key={benefit.title}
              theme={theme}
              scheme={scheme}
              radius="xl"
              style={[styles.benefitRow, { borderColor: theme.outlineVariant }]}
            >
              <View style={[styles.benefitIcon, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name={benefit.icon} size="sm" color={theme.accent} />
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
            onPress={() => router.push('/driver/onboarding/vehicle')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Commencer"
            style={styles.ctaWrap}
          >
            <LinearGradient
              colors={theme.inkGradient}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.cta}
            >
              <View pointerEvents="none" style={styles.ctaSheenClip}>
                <LinearGradient
                  colors={['transparent', theme.glimmer, 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ctaSheen}
                />
              </View>
              <Text variant="label" color={theme.onInk}>
                Commencer
              </Text>
              <Icon name="arrow-forward" size="sm" color={theme.onInk} />
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.secondaryBack}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Text variant="bodySmall" color={theme.inkMuted}>
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
    overflow: 'hidden',
  },
  glowTop: {
    position: 'absolute',
    top: -140,
    left: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.28,
  },
  glowSeam: {
    position: 'absolute',
    top: '30%',
    right: -110,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.14,
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
    borderTopWidth: 1,
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
    borderWidth: 1,
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
  ctaWrap: {
    width: '100%',
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  cta: {
    width: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  ctaSheenClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  ctaSheen: {
    position: 'absolute',
    top: -20,
    left: -40,
    width: '70%',
    height: '260%',
    transform: [{ rotate: '20deg' }],
  },
  secondaryBack: {
    padding: spacing.sm,
  },
});
