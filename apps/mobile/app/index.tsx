import { useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Circle } from 'react-native-svg';
import { Text, Button, colors, spacing, radii, typography } from '@vaya/design-system';
import { router, Redirect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useAppSelector } from '../src/state/store';

const ARC_SIZE = 200;
const STROKE_WIDTH = 34;
const RADIUS = (ARC_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Leaves a 60° gap centered at the bottom, so the shape reads as an open
// arc/arch rather than a closed ring.
const GAP_DEG = 60;
const SOLID_DEG = 360 - GAP_DEG;
const DASH = `${(SOLID_DEG / 360) * CIRCUMFERENCE} ${(GAP_DEG / 360) * CIRCUMFERENCE}`;
const ROTATION = 90 + GAP_DEG / 2;

/**
 * Stylized stand-in for the reference's photoreal 3D glass arc render — no 3D
 * asset pipeline here, so this approximates the same idea (a glassy,
 * sage-tinted open arc catching light, floating with a soft shadow) as a real
 * open arc rather than a closed ring.
 */
function GlassArcHero(): React.JSX.Element {
  return (
    <View style={styles.heroWrap}>
      <View style={styles.heroShadow} />
      <Svg width={ARC_SIZE} height={ARC_SIZE} viewBox={`0 0 ${ARC_SIZE} ${ARC_SIZE}`}>
        <Defs>
          <SvgGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#EAF0EA" />
            <Stop offset="45%" stopColor={colors.secondaryLight} />
            <Stop offset="75%" stopColor={colors.secondary} />
            <Stop offset="100%" stopColor="#3E5A41" />
          </SvgGradient>
        </Defs>
        <Circle
          cx={ARC_SIZE / 2}
          cy={ARC_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="url(#arcGrad)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={DASH}
          rotation={ROTATION}
          origin={`${ARC_SIZE / 2}, ${ARC_SIZE / 2}`}
        />
      </Svg>
      <View style={styles.heroHighlight} />
    </View>
  );
}

export default function LandingScreen(): React.JSX.Element {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const [phone, setPhone] = useState('');
  const canContinue = phone.replace(/\s/g, '').length >= 8;

  if (accessToken) {
    return <Redirect href="/(tabs)/explore" />;
  }

  function submit(): void {
    if (!canContinue) return;
    Keyboard.dismiss();
    router.push({ pathname: '/(auth)/otp', params: { phone: `+216 ${phone}` } });
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.content}>
          <GlassArcHero />

          <View style={styles.copy}>
            <Text style={styles.wordmark}>arc.</Text>
            <Text variant="body" color={colors.gray600}>
              Your path, naturally.
            </Text>
          </View>

          <View style={styles.formSection}>
            <Text variant="label" color={colors.gray600} style={styles.fieldLabel}>
              Phone number
            </Text>
            <BlurView intensity={40} tint="light" style={styles.glassInput}>
              <View style={styles.glassInputOverlay}>
                <View style={styles.countryPill}>
                  <Text style={styles.flag}>🇹🇳</Text>
                  <Text style={styles.countryCode}>+216</Text>
                </View>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="98 123 456"
                  placeholderTextColor={colors.gray500}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  onSubmitEditing={submit}
                  style={styles.input}
                />
              </View>
            </BlurView>

            <Button
              label="Get Started"
              size="lg"
              disabled={!canContinue}
              onPress={submit}
              style={styles.cta}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const RING_WRAP = ARC_SIZE + 40;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  heroWrap: {
    alignSelf: 'center',
    width: RING_WRAP,
    height: RING_WRAP,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  heroShadow: {
    position: 'absolute',
    bottom: 6,
    width: ARC_SIZE * 0.7,
    height: 20,
    borderRadius: 999,
    backgroundColor: colors.gray900,
    opacity: 0.12,
  },
  heroHighlight: {
    position: 'absolute',
    top: ARC_SIZE * 0.22,
    left: ARC_SIZE * 0.16,
    width: ARC_SIZE * 0.32,
    height: ARC_SIZE * 0.22,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.5)',
    transform: [{ rotate: '-25deg' }],
  },
  copy: {
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing['3xl'],
  },
  wordmark: {
    color: colors.gray900,
    fontWeight: '800',
    fontSize: 56,
    letterSpacing: -1.5,
  },
  formSection: {
    gap: spacing.sm,
  },
  fieldLabel: {
    marginLeft: spacing.xs,
  },
  glassInput: {
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  glassInputOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  countryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  flag: {
    fontSize: 16,
  },
  countryCode: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray900,
    fontSize: typography.fontSize.sm,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.gray900,
    paddingHorizontal: spacing.xs,
  },
  cta: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
