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
import {
  Text,
  Icon,
  BottomSheet,
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
 * project's premium dark hero, fixed-dark regardless of system theme (the
 * app's own brand-identity choice, same as driver/onboarding/index.tsx's
 * navy hero) rather than following useAppTheme()'s light/dark toggle.
 * Stitch's reference is a full-bleed cinematic photo with glass OAuth
 * buttons (Google/Facebook) — this backend has neither social login nor a
 * separate sign-up step (VerifyOtp always creates-or-logs-in by phone
 * number), so the photo becomes an on-brand ambient glow + the existing
 * RoutePulseBadge motif, and the buttons become the one real auth
 * mechanism this app has. "Subtly expandable": the landing itself stays a
 * simple hero + one CTA, matching the companion
 * `contextual-authentication-sheet.html`'s slide-up sheet pattern for the
 * actual phone-number step, rather than showing the input up front.
 */
export default function LandingScreen(): React.JSX.Element {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const [isAuthSheetOpen, setIsAuthSheetOpen] = useState(false);
  const [phone, setPhone] = useState('');
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
    setIsAuthSheetOpen(false);
    router.push({ pathname: '/(auth)/otp', params: { phone: `+216 ${phone}` } });
  }

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />

      <View style={styles.content}>
        <Animated.View style={[styles.hero, { opacity: fade, transform: [{ translateY: rise }] }]}>
          <RoutePulseBadge icon="navigate" size="hero" tone="onNavy" />
          <Text style={styles.wordmark}>VAYA</Text>
          <Text variant="h3" color={darkPalette.ink} align="center" style={styles.headline}>
            Voyagez, en toute confiance.
          </Text>
          <Text
            variant="body"
            color={darkPalette.inkMuted}
            align="center"
            style={styles.subhead}
          >
            Le covoiturage repensé pour la Tunisie — trajets vérifiés, prix justes, en toute
            simplicité.
          </Text>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: darkPalette.ink }]}
          onPress={() => setIsAuthSheetOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Commencer"
        >
          <Text variant="label" color={darkPalette.onInk}>
            Commencer
          </Text>
        </TouchableOpacity>
        <Text
          variant="bodySmall"
          color={darkPalette.inkFaint}
          align="center"
          style={styles.legalHint}
        >
          En continuant, vous acceptez nos conditions d&apos;utilisation.
        </Text>
      </View>

      <BottomSheet theme={darkPalette} visible={isAuthSheetOpen} onClose={() => setIsAuthSheetOpen(false)}>
        <KeyboardAvoidingView
          style={styles.sheetBody}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheetIconWrap, { backgroundColor: darkPalette.surfaceMuted }]}>
            <Icon name="call" size="md" color={darkPalette.ink} />
          </View>
          <Text variant="h3" color={darkPalette.ink} align="center">
            Rejoignez VAYA
          </Text>
          <Text
            variant="body"
            color={darkPalette.inkMuted}
            align="center"
            style={styles.sheetSubtitle}
          >
            Entrez votre numéro pour recevoir un code de vérification par SMS.
          </Text>

          <View
            style={[
              styles.phoneRow,
              { backgroundColor: darkPalette.surfaceMuted, borderColor: darkPalette.outlineVariant },
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
              autoFocus
              style={[styles.phoneInput, { color: darkPalette.ink }]}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.cta,
              { backgroundColor: darkPalette.ink },
              !canContinue && styles.ctaDisabled,
            ]}
            onPress={submit}
            disabled={!canContinue}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continuer"
            accessibilityState={{ disabled: !canContinue }}
          >
            <Text variant="label" color={darkPalette.onInk}>
              Continuer
            </Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </BottomSheet>
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
    opacity: 0.28,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -160,
    right: -100,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: darkPalette.accent,
    opacity: 0.16,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  hero: {
    alignItems: 'center',
  },
  wordmark: {
    marginTop: spacing.xl,
    color: darkPalette.ink,
    fontWeight: '800',
    fontSize: 40,
    letterSpacing: 4,
    textShadowColor: 'rgba(255,255,255,0.25)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  headline: {
    marginTop: spacing.lg,
    fontWeight: typography.fontWeight.bold,
  },
  subhead: {
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.sm,
  },
  cta: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  legalHint: {
    marginTop: spacing.xs,
  },
  sheetBody: {
    gap: spacing.md,
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  sheetIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSubtitle: {
    marginTop: -spacing.xs,
    maxWidth: 300,
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
    marginTop: spacing.sm,
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
});
