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
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  GlassSurface,
  darkPalette,
  spacing,
  radii,
  typography,
  haptics,
} from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useRequestOtpMutation, useVerifyOtpMutation } from '../../src/state/api';
import { useAppDispatch } from '../../src/state/store';
import { setTokens } from '../../src/state/authSlice';
import { saveTokens } from '../../src/services/auth/tokenStorage';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 28;

function maskPhone(phone: string): string {
  // "+216 98 123 456" -> "+216 98 *** ***"
  const parts = phone.trim().split(/\s+/);
  if (parts.length < 2) return phone;
  return [...parts.slice(0, 2), ...parts.slice(2).map((p) => '*'.repeat(p.length))].join(' ');
}

function OtpCell({ digit, active }: { digit?: string; active: boolean }): React.JSX.Element {
  const filled = digit !== undefined;
  return (
    <View style={[styles.otpCell, filled ? styles.otpCellFilled : null]}>
      {filled ? (
        <Text style={styles.otpDigit}>{digit}</Text>
      ) : (
        <View style={styles.otpGlowWrap}>
          <View style={styles.otpGlowHalo} />
          <View style={styles.otpGlowCore} />
        </View>
      )}
      <View style={[styles.otpUnderline, active ? styles.otpUnderlineActive : null]} />
    </View>
  );
}

/**
 * Matched to the same fixed-dark, jewel-emerald `darkPalette` treatment
 * `app/index.tsx` (the landing screen right before this one) now uses —
 * this screen previously stayed on the legacy static `colors` tokens with a
 * light cream gradient and a plain white `Button`, a visible seam right
 * after the new landing screen hands off into it. Same building blocks as
 * landing: a `backgroundGradient` wash + ambient glow blobs, a `GlassSurface`
 * card (here holding the OTP cell pill instead of a phone field), and a
 * hand-rolled `inkGradient` + `glimmer`-sheen primary CTA instead of the
 * legacy static `Button` primitive (no `theme` prop exists on `Button` yet —
 * same hand-rolled-per-screen precedent the rest of this pass established).
 * Also carries over the same custom keyboard-avoidance fix from the landing
 * screen: `KeyboardAvoidingView` only animates on iOS, so the CTA is lifted
 * via a `translateY` driven off the real keyboard event's own `duration`
 * instead, smooth on both platforms.
 */
export default function OtpScreen(): React.JSX.Element {
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const normalizedPhone = (phone ?? '').replace(/\s/g, '');
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const [requestOtp, { isLoading: isRequesting }] = useRequestOtpMutation();
  const [verifyOtp, { isLoading: isVerifying }] = useVerifyOtpMutation();

  async function sendCode(): Promise<void> {
    if (!normalizedPhone) return;
    setErrorMessage(undefined);
    try {
      const result = await requestOtp({ phone: normalizedPhone }).unwrap();
      setDevCode(result.devCode);
      setSecondsLeft(RESEND_SECONDS);
    } catch {
      setErrorMessage("Impossible d'envoyer le code. Vérifiez votre connexion.");
    }
  }

  useEffect(() => {
    void sendCode();
    // Only on mount — resend is a distinct user-triggered action below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  // A real layout resize (animated paddingBottom), not a transform — driven
  // by the real keyboard event's own duration so both platforms animate
  // smoothly (KeyboardAvoidingView's Android path is an instant `setValue`
  // snap regardless of `behavior`). Scoped to `lowerSection` only — the
  // header never moves, and because this shrinks real available flex space
  // rather than translating the whole screen, the vertically-centered OTP
  // block re-centers into the smaller area instead of ever being able to
  // ride up over the header/status bar.
  const keyboardPad = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const lift = Math.max(0, e.endCoordinates.height - insets.bottom + spacing.sm);
      Animated.timing(keyboardPad, {
        toValue: lift,
        duration: e.duration && e.duration > 0 ? e.duration : 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardPad, {
        toValue: 0,
        duration: e.duration && e.duration > 0 ? e.duration : 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardPad, insets.bottom]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const canVerify = code.length === CODE_LENGTH && !isVerifying;

  async function verify(): Promise<void> {
    if (code.length !== CODE_LENGTH || isVerifying) return;
    Keyboard.dismiss();
    setErrorMessage(undefined);
    try {
      const tokens = await verifyOtp({ phone: normalizedPhone, code }).unwrap();
      haptics.success();
      dispatch(setTokens(tokens));
      await saveTokens(tokens);
      router.replace('/(tabs)/explore');
    } catch {
      haptics.error();
      setErrorMessage('Code invalide ou expiré. Réessayez.');
      setCode('');
    }
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

        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={darkPalette.ink} />
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.lowerSection, { paddingBottom: keyboardPad }]}>
          <View style={styles.body}>
            <Text style={styles.title}>Entrez le code de vérification</Text>
            <Text variant="body" color={darkPalette.inkMuted} style={styles.subtitle}>
              Envoyé par SMS au {maskPhone(phone ?? '+216 98 *** ***')}
            </Text>

            <TouchableOpacity
              activeOpacity={1}
              onPress={() => inputRef.current?.focus()}
              style={styles.otpPillTouchable}
            >
              <GlassSurface theme={darkPalette} scheme="dark" radius="2xl">
                <View style={styles.otpOverlay}>
                  {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                    <OtpCell key={i} digit={code[i]} active={i === code.length} />
                  ))}
                </View>
              </GlassSurface>
            </TouchableOpacity>
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH))}
              keyboardType="number-pad"
              style={styles.hiddenInput}
              autoFocus
              maxLength={CODE_LENGTH}
              returnKeyType="done"
              onSubmitEditing={verify}
            />

            {errorMessage ? (
              <Text variant="bodySmall" color={darkPalette.error} align="center" style={styles.resend}>
                {errorMessage}
              </Text>
            ) : devCode ? (
              <Text
                variant="bodySmall"
                color={darkPalette.inkFaint}
                align="center"
                style={styles.resend}
              >
                Code de test : {devCode}
              </Text>
            ) : null}

            {secondsLeft > 0 ? (
              <Text
                variant="bodySmall"
                color={darkPalette.inkFaint}
                align="center"
                style={styles.resend}
              >
                Renvoyer le code dans {mm}:{ss}
              </Text>
            ) : (
              <TouchableOpacity
                onPress={() => void sendCode()}
                disabled={isRequesting}
                style={styles.resend}
              >
                <Text variant="bodySmall" color={darkPalette.accent} align="center">
                  Renvoyer le code
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={() => void verify()}
            disabled={!canVerify}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Vérifier et continuer"
            accessibilityState={{ disabled: !canVerify, busy: isVerifying }}
            style={[
              styles.ctaWrap,
              { marginBottom: insets.bottom + spacing.lg },
              !canVerify && styles.ctaDisabled,
            ]}
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
              {isVerifying ? (
                <ActivityIndicator color={darkPalette.onInk} size="small" />
              ) : (
                <Text variant="label" color={darkPalette.onInk}>
                  Vérifier et continuer
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const CELL_SIZE = 46;

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
    paddingHorizontal: spacing['2xl'],
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fills the space below the header; centers the OTP block within it
  // instead of top-anchoring it with a dead gap above the CTA. `paddingBottom`
  // is the animated keyboard-avoidance value — a real layout shrink, so
  // `body`'s centering recomputes into the smaller area on its own rather
  // than needing a hand-computed translate.
  lowerSection: {
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    justifyContent: 'space-between',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: darkPalette.ink,
    fontWeight: '800',
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: spacing.md,
  },
  otpPillTouchable: {
    alignSelf: 'flex-start',
    marginTop: spacing['4xl'],
  },
  otpOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  otpCell: {
    width: CELL_SIZE,
    height: CELL_SIZE + 8,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  otpCellFilled: {
    backgroundColor: darkPalette.surface,
  },
  otpDigit: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: darkPalette.ink,
  },
  otpGlowWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpGlowHalo: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: darkPalette.accentGlow,
    opacity: 0.7,
  },
  otpGlowCore: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: darkPalette.accent,
  },
  otpUnderline: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: darkPalette.outline,
  },
  otpUnderlineActive: {
    backgroundColor: darkPalette.accent,
  },
  resend: {
    marginTop: spacing.lg,
    alignSelf: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
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
});
