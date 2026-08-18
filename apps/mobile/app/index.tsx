import { useState } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Text, Button, colors, spacing, radii, typography } from '@vaya/design-system';
import { router } from 'expo-router';

/**
 * Stylized stand-in for the reference's photoreal 3D glass "arc" render —
 * no 3D asset pipeline here, so this approximates the same idea (a glassy,
 * sage-tinted ring catching light, floating with a soft shadow) with layered
 * gradients instead of claiming photographic accuracy.
 */
function GlassArcHero(): React.JSX.Element {
  return (
    <View style={styles.heroWrap}>
      <View style={styles.heroShadow} />
      <LinearGradient
        colors={['#EAF0EA', colors.secondaryLight, colors.secondary, '#3E5A41']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.heroRing}
      />
      <View style={styles.heroHole} />
      <LinearGradient
        colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 0.6, y: 0.5 }}
        style={styles.heroHighlight}
      />
    </View>
  );
}

export default function LandingScreen(): React.JSX.Element {
  const [phone, setPhone] = useState('');
  const canContinue = phone.replace(/\s/g, '').length >= 8;

  return (
    <View style={styles.container}>
      <GlassArcHero />

      <View style={styles.copy}>
        <Text variant="h1" style={styles.wordmark}>
          arc.
        </Text>
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
              style={styles.input}
            />
          </View>
        </BlurView>

        <Button
          label="Get Started"
          size="lg"
          disabled={!canContinue}
          onPress={() =>
            router.push({ pathname: '/(auth)/otp', params: { phone: `+216 ${phone}` } })
          }
          style={styles.cta}
        />
      </View>
    </View>
  );
}

const RING_SIZE = 172;
const HOLE_SIZE = 96;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  heroWrap: {
    alignSelf: 'center',
    width: RING_SIZE + 40,
    height: RING_SIZE + 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  heroShadow: {
    position: 'absolute',
    bottom: 6,
    width: RING_SIZE * 0.75,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.gray900,
    opacity: 0.12,
  },
  heroRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    shadowColor: colors.secondaryDark,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 22,
    elevation: 10,
  },
  heroHole: {
    position: 'absolute',
    width: HOLE_SIZE,
    height: HOLE_SIZE,
    borderRadius: HOLE_SIZE / 2,
    backgroundColor: colors.gray100,
    top: (RING_SIZE + 40 - HOLE_SIZE) / 2 + 10,
  },
  heroHighlight: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: RING_SIZE * 0.55,
    height: RING_SIZE * 0.4,
    borderRadius: RING_SIZE / 2,
  },
  copy: {
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing['3xl'],
  },
  wordmark: {
    color: colors.gray900,
    fontWeight: '800',
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
