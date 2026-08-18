import { useEffect, useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, colors, spacing, radii, typography } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 28;

function maskPhone(phone: string): string {
  // "+216 98 123 456" -> "+216 98 *** ***"
  const parts = phone.trim().split(/\s+/);
  if (parts.length < 2) return phone;
  return [...parts.slice(0, 2), ...parts.slice(2).map((p) => '*'.repeat(p.length))].join(' ');
}

export default function OtpScreen(): React.JSX.Element {
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <LinearGradient
      colors={[colors.gray100, colors.secondaryLight + '33', colors.gray100]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.container}
    >
      <View style={{ paddingTop: insets.top + spacing.sm }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.gray900} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text variant="h1" style={styles.title}>
          Enter Verification Code
        </Text>
        <Text variant="body" color={colors.gray600}>
          Sent via SMS to {maskPhone(phone ?? '+216 98 *** ***')}
        </Text>

        <BlurView intensity={35} tint="light" style={styles.otpPill}>
          <View style={styles.otpOverlay}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) =>
              i < code.length ? (
                <View key={i} style={styles.otpCell}>
                  <Text style={styles.otpDigit}>{code[i]}</Text>
                </View>
              ) : (
                <View key={i} style={styles.otpDot} />
              ),
            )}
          </View>
        </BlurView>
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH))}
          keyboardType="number-pad"
          style={styles.hiddenInput}
          autoFocus
          maxLength={CODE_LENGTH}
        />

        {secondsLeft > 0 ? (
          <Text variant="bodySmall" color={colors.gray500} align="center">
            Resend code in {mm}:{ss}
          </Text>
        ) : (
          <TouchableOpacity onPress={() => setSecondsLeft(RESEND_SECONDS)}>
            <Text variant="bodySmall" color={colors.secondaryDark} align="center">
              Resend code
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Button
        label="Verify & Continue"
        size="lg"
        disabled={code.length < CODE_LENGTH}
        onPress={() => router.replace('/(tabs)/explore')}
        style={[styles.cta, { marginBottom: insets.bottom + spacing.lg }]}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  title: {
    color: colors.gray900,
    fontWeight: '800',
    lineHeight: 38,
  },
  otpPill: {
    borderRadius: radii.full,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  otpOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  otpCell: {
    width: 34,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray900,
  },
  otpDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.secondary,
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
