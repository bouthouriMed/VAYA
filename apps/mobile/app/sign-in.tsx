import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  Animated,
  Easing,
  AccessibilityInfo,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Text,
  GlassSurface,
  RoutePulseBadge,
  darkPalette,
  spacing,
  radii,
  typography,
  haptics,
} from '@vaya/design-system';
import { router, Redirect } from 'expo-router';
import { useAppSelector, useAppDispatch } from '../src/state/store';
import { useGoogleExchangeMutation } from '../src/state/api';
import { setTokens } from '../src/state/authSlice';
import { saveTokens } from '../src/services/auth/tokenStorage';
import { signInWithGoogle } from '../src/services/auth/googleAuth';

/**
 * stitch/landing/vaya-landing-premium-dark-mode.html — the "Vaya Landing"
 * project's premium dark hero, matched structurally: a centered "VAYA"
 * wordmark pinned to the top, hero copy + a glass auth card bottom-anchored
 * (the reference's flex-col justify-between), a sheen-lit primary CTA inside
 * the card, and a legal line below it. Fixed-dark regardless of system theme
 * (the app's own brand-identity choice, same as driver/onboarding/index.tsx's
 * navy hero) rather than following useAppTheme()'s light/dark toggle.
 *
 * One deliberate divergence, forced by what this app actually has: the
 * reference's full-bleed cinematic photo has no real asset behind it in this
 * codebase and wasn't fabricated/sourced — replaced with the same ambient
 * ink-gradient + accent-glow treatment `driver/onboarding/index.tsx` already
 * establishes, plus the existing `RoutePulseBadge` hero motif.
 *
 * The reference shows three auth mechanisms (Google, Facebook, email); this
 * backend now has exactly one of those three for real (Google — a
 * server-mediated OAuth flow, `src/services/auth/googleAuth.ts`) alongside
 * the phone/OTP mechanism the reference doesn't show at all. Facebook/email
 * stay unbuilt (no backend mechanism exists for either) rather than adding
 * stand-in buttons that don't work.
 *
 * No longer the app's mandatory first screen: guest browsing (search →
 * results → ride details, and the publish form) doesn't require this at
 * all — `index.tsx` now opens straight into `(tabs)/explore` for everyone.
 * This screen is reached explicitly instead: proactively, or as the
 * fallback for something that genuinely needs an account. The two
 * highest-friction moments (Demander une place, publish's form-step
 * Continuer) don't route here at all — they use ContextualAuthSheet
 * (`src/features/auth/`) so a guest never loses the ride they picked or the
 * form they filled in. Since this screen can now be reached mid-flow (not
 * just cold-start), it gets a real close affordance instead of assuming
 * there's nowhere to go back to.
 */
export default function SignInScreen(): React.JSX.Element {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const [phone, setPhone] = useState('');
  const [isPhoneFocused, setIsPhoneFocused] = useState(false);
  const canContinue = phone.replace(/\s/g, '').length >= 8;

  const [googleExchange] = useGoogleExchangeMutation();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | undefined>();

  async function continueWithGoogle(): Promise<void> {
    if (isGoogleLoading) return;
    setGoogleError(undefined);
    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.status === 'success') {
        const tokens = await googleExchange({ ticket: result.ticket }).unwrap();
        haptics.success();
        dispatch(setTokens(tokens));
        await saveTokens(tokens);
        router.replace('/(tabs)/explore');
        return;
      }
      if (result.status === 'error') {
        haptics.error();
        setGoogleError('Connexion Google impossible. Réessayez.');
      }
      // 'cancelled': the user closed the browser themselves — no error to show.
    } catch {
      haptics.error();
      setGoogleError('Connexion Google impossible. Réessayez.');
    } finally {
      setIsGoogleLoading(false);
    }
  }

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

  // Hand-rolled instead of KeyboardAvoidingView: RN's own implementation only
  // animates the padding/height shift on iOS (`_onKeyboardChange` calls
  // `setValue` directly on Android, a hard instant snap by design, regardless
  // of the `behavior` prop). Driving a translateY off the real keyboard
  // show/hide event's own `duration` keeps both platforms smooth and in sync
  // with the native keyboard animation instead of jumping.
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const lift = Math.max(0, e.endCoordinates.height - spacing['2xl']);
      Animated.timing(keyboardOffset, {
        toValue: -lift,
        duration: e.duration && e.duration > 0 ? e.duration : 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: e.duration && e.duration > 0 ? e.duration : 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);

  if (accessToken) {
    return <Redirect href="/(tabs)/explore" />;
  }

  function submit(): void {
    if (!canContinue) return;
    router.push({ pathname: '/(auth)/otp', params: { phone: `+216 ${phone}` } });
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <LinearGradient
          colors={darkPalette.backgroundGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={styles.glowTop} />
        <View pointerEvents="none" style={styles.glowBottom} />

        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <TouchableOpacity
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/(tabs)/explore')
            }
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <Ionicons name="close" size={24} color={darkPalette.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.spacer} />

        <Animated.View
          style={[
            styles.main,
            { opacity: fade, transform: [{ translateY: Animated.add(rise, keyboardOffset) }] },
          ]}
        >
          <RoutePulseBadge icon="navigate" size="hero" tone="onNavy" />
          <Text
            variant="headlineDisplay"
            color={darkPalette.ink}
            align="center"
            style={styles.headline}
          >
            Voyagez, en toute confiance.
          </Text>
          <Text variant="body" color={darkPalette.inkMuted} align="center" style={styles.subhead}>
            Le covoiturage repensé pour la Tunisie — trajets vérifiés, prix justes, en toute
            simplicité.
          </Text>

          <GlassSurface theme={darkPalette} scheme="dark" radius="xl" style={styles.card}>
            <View style={styles.cardBody}>
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

              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: darkPalette.outlineVariant }]} />
                <Text variant="caption" color={darkPalette.inkFaint}>
                  ou
                </Text>
                <View style={[styles.dividerLine, { backgroundColor: darkPalette.outlineVariant }]} />
              </View>

              <TouchableOpacity
                onPress={() => void continueWithGoogle()}
                disabled={isGoogleLoading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Continuer avec Google"
                accessibilityState={{ disabled: isGoogleLoading, busy: isGoogleLoading }}
                style={[
                  styles.googleCta,
                  {
                    backgroundColor: darkPalette.surface,
                    borderColor: darkPalette.outlineVariant,
                  },
                  isGoogleLoading && styles.ctaDisabled,
                ]}
              >
                {isGoogleLoading ? (
                  <ActivityIndicator color={darkPalette.ink} size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={18} color={darkPalette.ink} />
                    <Text variant="label" color={darkPalette.ink}>
                      Continuer avec Google
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {googleError ? (
                <Text variant="bodySmall" color={darkPalette.error} align="center">
                  {googleError}
                </Text>
              ) : null}
            </View>
          </GlassSurface>

          <Text
            variant="bodySmall"
            color={darkPalette.inkFaint}
            align="center"
            style={styles.legalHint}
          >
            En continuant, vous acceptez nos conditions d&apos;utilisation.
          </Text>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
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
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  googleCta: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  legalHint: {
    marginTop: spacing.md,
    maxWidth: 300,
  },
});
