import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  AccessibilityInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Text,
  GlassSurface,
  RoutePulseBadge,
  darkPalette,
  spacing,
  radii,
  typography,
} from '@vaya/design-system';
import { router, Redirect } from 'expo-router';
import { useAppSelector } from '../src/state/store';

/**
 * stitch/landing/vaya-landing-premium-dark-mode.html — the "Vaya Landing"
 * project's premium dark hero, matched structurally: a centered "VAYA"
 * wordmark pinned to the top, hero copy + a glass auth card bottom-anchored
 * (the reference's flex-col justify-between), a sheen-lit primary CTA inside
 * the card, and a legal line below it. Fixed-dark regardless of system theme
 * (the app's own brand-identity choice, same as driver/onboarding/index.tsx's
 * navy hero) rather than following useAppTheme()'s light/dark toggle.
 *
 * Two deliberate divergences, both forced by what this app actually has:
 * (1) the reference's full-bleed cinematic photo has no real asset behind it
 * in this codebase and wasn't fabricated/sourced — replaced with the same
 * ambient ink-gradient + accent-glow treatment `driver/onboarding/index.tsx`
 * already establishes, plus the existing `RoutePulseBadge` hero motif;
 * (2) the reference shows three auth mechanisms (Google, Facebook, email)
 * this backend has none of (`VerifyOtp` always creates-or-logs-in by phone
 * number, no social login, no separate sign-up step) — so the glass card
 * shows the one real mechanism directly, inline, rather than three stand-ins
 * or a second screen behind them.
 */
export default function LandingScreen(): React.JSX.Element {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const [phone, setPhone] = useState('');
  const [isPhoneFocused, setIsPhoneFocused] = useState(false);
  const canContinue = phone.replace(/\s/g, '').length >= 8;

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        fade.setValue(1);
        rise.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(rise, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
  }, [fade, rise]);

  if (accessToken) {
    return <Redirect href="/(tabs)/explore" />;
  }

  function submit(): void {
    if (!canContinue) return;
    router.push({ pathname: '/(auth)/otp', params: { phone: `+216 ${phone}` } });
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={darkPalette.backgroundGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />

      <View style={styles.header}>
        <Text style={styles.wordmark}>VAYA</Text>
      </View>

      <View style={styles.spacer} />

      <Animated.View style={[styles.main, { opacity: fade, transform: [{ translateY: rise }] }]}>
        <RoutePulseBadge icon="navigate" size="hero" tone="onNavy" />
        <Text variant="h3" color={darkPalette.ink} align="center" style={styles.headline}>
          Voyagez, en toute confiance.
        </Text>
        <Text variant="body" color={darkPalette.inkMuted} align="center" style={styles.subhead}>
          Le covoiturage repensé pour la Tunisie — trajets vérifiés, prix justes, en toute
          simplicité.
        </Text>

        <GlassSurface theme={darkPalette} scheme="dark" radius="xl" style={styles.card}>
          <KeyboardAvoidingView
            style={styles.cardBody}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Text variant="label" color={darkPalette.inkMuted} style={styles.cardLabel}>
              Rejoignez VAYA avec votre numéro
            </Text>
            <View
              style={[
                styles.phoneRow,
                {
                  backgroundColor: darkPalette.surfaceMuted,
                  borderColor: isPhoneFocused ? darkPalette.accent : darkPalette.outlineVariant,
                },
              ]}
            >
              <View style={[styles.countryPill, { backgroundColor: darkPalette.surface }]}>
                <Text style={styles.flag}>🇹🇳</Text>
                <Text variant="label" color={darkPalette.ink}>
                  +216
                </Text>
              </View>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="98 123 456"
                placeholderTextColor={darkPalette.inkFaint}
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={submit}
                onFocus={() => setIsPhoneFocused(true)}
                onBlur={() => setIsPhoneFocused(false)}
                style={[styles.phoneInput, { color: darkPalette.ink }]}
                accessibilityLabel="Numéro de téléphone"
              />
            </View>

            <TouchableOpacity
              onPress={submit}
              disabled={!canContinue}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continuer"
              accessibilityState={{ disabled: !canContinue }}
              style={[styles.ctaWrap, !canContinue && styles.ctaDisabled]}
            >
              <LinearGradient
                colors={darkPalette.inkGradient}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.cta}
              >
                <View pointerEvents="none" style={styles.ctaSheenClip}>
                  <LinearGradient
                    colors={['transparent', darkPalette.glimmer, 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ctaSheen}
                  />
                </View>
                <Text variant="label" color={darkPalette.onInk}>
                  Continuer
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </GlassSurface>

        <Text variant="bodySmall" color={darkPalette.inkFaint} align="center" style={styles.legalHint}>
          En continuant, vous acceptez nos conditions d&apos;utilisation.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkPalette.background,
    overflow: 'hidden',
  },
  glowTop: {
    position: 'absolute',
    top: -140,
    left: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: darkPalette.accentGlow,
    opacity: 0.3,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -160,
    right: -100,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: darkPalette.accent,
    opacity: 0.18,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing['3xl'],
  },
  spacer: {
    flex: 1,
  },
  wordmark: {
    color: darkPalette.ink,
    fontWeight: '800',
    fontSize: 28,
    letterSpacing: 5,
    textShadowColor: 'rgba(255,255,255,0.25)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  main: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  headline: {
    marginTop: spacing.lg,
    fontWeight: typography.fontWeight.bold,
  },
  subhead: {
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  card: {
    width: '100%',
    marginTop: spacing.xl,
  },
  cardBody: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardLabel: {
    textAlign: 'center',
  },
  phoneRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  countryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  flag: {
    fontSize: 16,
  },
  phoneInput: {
    flex: 1,
    fontSize: typography.fontSize.md,
    paddingHorizontal: spacing.xs,
  },
  ctaWrap: {
    width: '100%',
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  cta: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
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
  legalHint: {
    marginTop: spacing.md,
    maxWidth: 300,
  },
});
