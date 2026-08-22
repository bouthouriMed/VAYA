import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, Text, useAppTheme, spacing, radii, haptics } from '@vaya/design-system';
import {
  useRequestOtpMutation,
  useVerifyOtpMutation,
  useGoogleExchangeMutation,
} from '../../state/api';
import { useAppDispatch } from '../../state/store';
import { setTokens } from '../../state/authSlice';
import { saveTokens } from '../../services/auth/tokenStorage';
import { signInWithGoogle } from '../../services/auth/googleAuth';
import { contextualAuthCopy } from './contextualAuthCopy';
import type { ContextualAuthTrigger } from './useContextualAuth';

interface ContextualAuthSheetProps {
  visible: boolean;
  trigger: ContextualAuthTrigger;
  onClose: () => void;
  /** Fired the instant a real session exists (tokens dispatched + persisted)
   *  — the caller resumes whatever action prompted the sheet. This
   *  component never navigates on its own. */
  onAuthenticated: () => void;
}

type PhoneStep = 'phone' | 'code';

/**
 * stitch/landing/contextual-authentication-sheet.html, adapted the same way
 * app/index.tsx already was: the reference shows Google/Facebook/Instagram/
 * Email, but this backend only has two real mechanisms (Google OAuth,
 * phone/OTP) — no stand-in buttons for ones that don't work. A condensed,
 * in-sheet version of index.tsx's phone+Google flow rather than navigating
 * to a separate screen: the whole point of "contextual" auth is that the
 * guest never loses the ride they picked or the publish form they filled in.
 */
export function ContextualAuthSheet({
  visible,
  trigger,
  onClose,
  onAuthenticated,
}: ContextualAuthSheetProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const dispatch = useAppDispatch();
  const copy = contextualAuthCopy(trigger);

  const [phoneStep, setPhoneStep] = useState<PhoneStep>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const [requestOtp, { isLoading: isSendingOtp }] = useRequestOtpMutation();
  const [verifyOtp, { isLoading: isVerifyingOtp }] = useVerifyOtpMutation();
  const [googleExchange] = useGoogleExchangeMutation();

  useEffect(() => {
    if (!visible) {
      setPhoneStep('phone');
      setPhone('');
      setCode('');
      setDevCode(undefined);
      setErrorMessage(undefined);
      setIsGoogleLoading(false);
    }
  }, [visible]);

  const canSendPhone = phone.replace(/\s/g, '').length >= 8 && !isSendingOtp;
  const canVerifyCode = code.length === 6 && !isVerifyingOtp;

  async function sendCode(): Promise<void> {
    if (!canSendPhone) return;
    setErrorMessage(undefined);
    try {
      const result = await requestOtp({ phone: `+216${phone.replace(/\s/g, '')}` }).unwrap();
      setDevCode(result.devCode);
      setPhoneStep('code');
    } catch {
      setErrorMessage('Numéro invalide ou envoi impossible. Réessayez.');
    }
  }

  async function verifyCode(): Promise<void> {
    if (!canVerifyCode) return;
    setErrorMessage(undefined);
    try {
      const tokens = await verifyOtp({
        phone: `+216${phone.replace(/\s/g, '')}`,
        code,
      }).unwrap();
      haptics.success();
      dispatch(setTokens(tokens));
      await saveTokens(tokens);
      onAuthenticated();
    } catch {
      haptics.error();
      setErrorMessage('Code invalide ou expiré. Réessayez.');
      setCode('');
    }
  }

  async function continueWithGoogle(): Promise<void> {
    if (isGoogleLoading) return;
    setErrorMessage(undefined);
    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.status === 'success') {
        const tokens = await googleExchange({ ticket: result.ticket }).unwrap();
        haptics.success();
        dispatch(setTokens(tokens));
        await saveTokens(tokens);
        onAuthenticated();
        return;
      }
      if (result.status === 'error') {
        haptics.error();
        setErrorMessage('Connexion Google impossible. Réessayez.');
      }
      // 'cancelled': the guest closed the browser themselves — no error.
    } catch {
      haptics.error();
      setErrorMessage('Connexion Google impossible. Réessayez.');
    } finally {
      setIsGoogleLoading(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={phoneStep === 'phone' ? copy.title : 'Vérification'}
      heightRatio={phoneStep === 'phone' ? 0.56 : 0.42}
      theme={theme}
    >
      {phoneStep === 'phone' ? (
        <View style={styles.body}>
          <Text variant="bodySmall" color={theme.inkMuted} align="center" style={styles.subtitle}>
            {copy.subtitle}
          </Text>

          <TouchableOpacity
            onPress={() => void continueWithGoogle()}
            disabled={isGoogleLoading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continuer avec Google"
            accessibilityState={{ disabled: isGoogleLoading, busy: isGoogleLoading }}
            style={[
              styles.googleCta,
              { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
              isGoogleLoading && styles.disabled,
            ]}
          >
            {isGoogleLoading ? (
              <ActivityIndicator color={theme.ink} size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color={theme.ink} />
                <Text variant="label" color={theme.ink}>
                  Continuer avec Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.outlineVariant }]} />
            <Text variant="caption" color={theme.inkFaint}>
              ou avec votre numéro
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.outlineVariant }]} />
          </View>

          <View
            style={[
              styles.phoneRow,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant },
            ]}
          >
            <View style={[styles.countryPill, { backgroundColor: theme.surface }]}>
              <Text variant="label" color={theme.ink}>
                +216
              </Text>
            </View>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="98 123 456"
              placeholderTextColor={theme.inkFaint}
              keyboardType="phone-pad"
              returnKeyType="done"
              onSubmitEditing={() => void sendCode()}
              style={[styles.phoneInput, { color: theme.ink }]}
              accessibilityLabel="Numéro de téléphone"
            />
          </View>

          {errorMessage ? (
            <Text variant="bodySmall" color={theme.error} align="center">
              {errorMessage}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={() => void sendCode()}
            disabled={!canSendPhone}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continuer"
            accessibilityState={{ disabled: !canSendPhone, busy: isSendingOtp }}
            style={[styles.cta, { backgroundColor: theme.ink }, !canSendPhone && styles.disabled]}
          >
            {isSendingOtp ? (
              <ActivityIndicator color={theme.onInk} size="small" />
            ) : (
              <Text variant="label" color={theme.onInk}>
                Continuer
              </Text>
            )}
          </TouchableOpacity>

          <Text variant="caption" color={theme.inkFaint} align="center" style={styles.legal}>
            En continuant, vous acceptez nos conditions d&apos;utilisation.
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          <Text variant="bodySmall" color={theme.inkMuted} align="center">
            Code envoyé au +216 {phone}
          </Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={theme.inkFaint}
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={() => void verifyCode()}
            style={[
              styles.otpInput,
              { color: theme.ink, borderColor: theme.outlineVariant, backgroundColor: theme.surfaceMuted },
            ]}
            accessibilityLabel="Code de vérification"
            autoFocus
          />
          {devCode ? (
            <Text variant="bodySmall" color={theme.inkFaint} align="center">
              Code de test : {devCode}
            </Text>
          ) : null}
          {errorMessage ? (
            <Text variant="bodySmall" color={theme.error} align="center">
              {errorMessage}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => void verifyCode()}
            disabled={!canVerifyCode}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Vérifier"
            accessibilityState={{ disabled: !canVerifyCode, busy: isVerifyingOtp }}
            style={[styles.cta, { backgroundColor: theme.ink }, !canVerifyCode && styles.disabled]}
          >
            {isVerifyingOtp ? (
              <ActivityIndicator color={theme.onInk} size="small" />
            ) : (
              <Text variant="label" color={theme.onInk}>
                Vérifier
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPhoneStep('phone')} accessibilityRole="button">
            <Text variant="bodySmall" color={theme.accent} align="center">
              Changer de numéro
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  subtitle: {
    marginBottom: spacing.xs,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  countryPill: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: spacing.xs,
  },
  otpInput: {
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: 20,
    letterSpacing: 6,
    textAlign: 'center',
  },
  cta: {
    minHeight: 52,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  legal: {
    marginTop: -spacing.xs,
  },
});
