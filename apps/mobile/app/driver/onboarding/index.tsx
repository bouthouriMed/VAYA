import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
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
  Button,
} from '@vaya/design-system';
import { router } from 'expo-router';

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
  const { t } = useTranslation('driver');
  const isDark = scheme === 'dark';

  const BENEFITS: { icon: IconName; title: string; body: string }[] = [
    {
      icon: 'car-sport-outline',
      title: t('onboarding.index.benefits.verified'),
      body: t('onboarding.index.benefits.verifiedDesc'),
    },
    {
      icon: 'shield-checkmark-outline',
      title: t('onboarding.index.benefits.documents'),
      body: t('onboarding.index.benefits.documentsDesc'),
    },
    {
      icon: 'time-outline',
      title: t('onboarding.index.benefits.earnings'),
      body: t('onboarding.index.benefits.earningsDesc'),
    },
  ];
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
      <View style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}>
        <ScreenHeader onBack={() => router.back()} transparent bordered={false} backLabel={t('onboarding.index.back')} />

        <Animated.View
          style={[styles.heroBody, { opacity: fade, transform: [{ translateY: rise }] }]}
        >
          <RoutePulseBadge icon="car-sport" size="hero" tone={isDark ? 'onNavy' : 'onCream'} />
          <Text variant="caption" color={theme.accent} style={styles.eyebrow}>
            PROFIL CONDUCTEUR
          </Text>
          <Text variant="headlineDisplay" color={theme.ink} style={styles.headline}>
            {t('onboarding.index.title')}
          </Text>
          <Text variant="body" color={theme.inkMuted} style={styles.subhead}>
            {t('onboarding.index.subtitle')}
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
              style={[styles.benefitCard, { borderColor: theme.outlineVariant }]}
            >
              <View style={styles.benefitRow}>
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
              </View>
            </GlassSurface>
          ))}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Button
            size="lg"
            label={t('onboarding.index.startCta')}
            trailingIcon="arrow-forward"
            onPress={() => router.push('/driver/onboarding/vehicle')}
            style={styles.ctaWrap}
          />
          <Button variant="ghost" label={t('onboarding.index.later')} onPress={() => router.back()} />
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
    textTransform: 'uppercase',
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
  benefitCard: {
    borderWidth: 1,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  ctaWrap: {
    width: '100%',
  },
});
