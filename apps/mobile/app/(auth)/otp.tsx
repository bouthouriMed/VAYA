import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, colors, spacing, radii, typography, haptics } from '@vaya/design-system';
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
    <LinearGradient
      colors={[colors.gray100, colors.secondaryLight + '40', colors.gray100]}
      locations={[0, 0.55, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={styles.gradient}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={{ paddingTop: insets.top + spacing.md }}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={26} color={colors.gray900} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>Enter Verification Code</Text>
            <Text variant="body" color={colors.gray600} style={styles.subtitle}>
              Sent via SMS to {maskPhone(phone ?? '+216 98 *** ***')}
            </Text>

            <TouchableOpacity
              activeOpacity={1}
              onPress={() => inputRef.current?.focus()}
              style={styles.otpPillTouchable}
            >
              <BlurView intensity={35} tint="light" style={styles.otpPill}>
                <View style={styles.otpOverlay}>
                  {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                    <OtpCell key={i} digit={code[i]} active={i === code.length} />
                  ))}
                </View>
              </BlurView>
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
              <Text variant="bodySmall" color={colors.error} align="center" style={styles.resend}>
                {errorMessage}
              </Text>
            ) : devCode ? (
              <Text variant="bodySmall" color={colors.gray500} align="center" style={styles.resend}>
                Code de test : {devCode}
              </Text>
            ) : null}

            {secondsLeft > 0 ? (
              <Text variant="bodySmall" color={colors.gray500} align="center" style={styles.resend}>
                Resend code in {mm}:{ss}
              </Text>
            ) : (
              <TouchableOpacity
                onPress={() => void sendCode()}
                disabled={isRequesting}
                style={styles.resend}
              >
                <Text variant="bodySmall" color={colors.secondaryDark} align="center">
                  Resend code
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Button
            label="Verify & Continue"
            size="lg"
            disabled={!canVerify}
            loading={isVerifying}
            onPress={() => void verify()}
            style={[styles.cta, { marginBottom: insets.bottom + spacing.lg }]}
          />
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </LinearGradient>
  );
}

const CELL_SIZE = 46;

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    marginTop: spacing['2xl'],
  },
  title: {
    color: colors.gray900,
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
  otpPill: {
    borderRadius: radii['2xl'],
    overflow: 'hidden',
  },
  otpOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
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
    backgroundColor: colors.white,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  otpDigit: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.gray900,
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
    backgroundColor: colors.secondaryLight,
    opacity: 0.55,
  },
  otpGlowCore: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.white,
  },
  otpUnderline: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.gray300,
  },
  otpUnderlineActive: {
    backgroundColor: colors.gray900,
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
  cta: {
    width: '100%',
  },
});
