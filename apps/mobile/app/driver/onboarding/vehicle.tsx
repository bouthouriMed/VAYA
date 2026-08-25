import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Text,
  Icon,
  Input,
  GlassSurface,
  StepProgress,
  useAppTheme,
  spacing,
  radii,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../../src/state/store';
import { setVehicleDraft } from '../../../src/state/driverOnboardingSlice';

const TOTAL_STEPS = 4;

export default function VehicleStepScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const { t } = useTranslation('driver');
  const dispatch = useAppDispatch();
  const draft = useAppSelector((s) => s.driverOnboarding.vehicle);

  const [make, setMake] = useState(draft?.make ?? '');
  const [model, setModel] = useState(draft?.model ?? '');
  const [color, setColor] = useState(draft?.color ?? '');
  const [plateNumber, setPlateNumber] = useState(draft?.plateNumber ?? '');
  const [seatCount, setSeatCount] = useState(draft?.seatCount ?? 4);

  const canContinue = make.trim() && model.trim() && color.trim() && plateNumber.trim();

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        fade.setValue(1);
        return;
      }
      Animated.timing(fade, { toValue: 1, duration: 360, useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function next(): void {
    if (!canContinue) return;
    dispatch(
      setVehicleDraft({
        make: make.trim(),
        model: model.trim(),
        color: color.trim(),
        plateNumber: plateNumber.trim(),
        seatCount,
      }),
    );
    router.push('/driver/onboarding/license');
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.index.back')}
          >
            <Icon name="arrow-back" size="sm" color={theme.ink} />
          </TouchableOpacity>
          <Text variant="caption" color={theme.inkFaint} style={styles.headerStepLabel}>
            {t('onboarding.vehicle.stepLabel', { current: 1, total: TOTAL_STEPS })}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <StepProgress currentStep={1} totalSteps={TOTAL_STEPS} theme={theme} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fade }}>
          <View style={[styles.badge, { backgroundColor: theme.surfaceMuted }]}>
            <Icon name="car-sport" size="lg" color={theme.ink} />
          </View>
          <Text variant="label" color={theme.inkFaint} style={styles.eyebrow}>
            PROFIL CONDUCTEUR
          </Text>
          <Text variant="headlineDisplay" color={theme.ink} style={styles.title}>
            {t('onboarding.vehicle.stepTitle')}
          </Text>
          <Text variant="body" color={theme.inkMuted} style={styles.subtitle}>
            {t('onboarding.index.subtitle')}
          </Text>

          <GlassSurface theme={theme} radius="2xl" style={styles.card}>
            <Text variant="label" color={theme.inkFaint} style={styles.cardEyebrow}>
              {t('onboarding.vehicle.vehicleDetails')}
            </Text>
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Input theme={theme} label={t('onboarding.vehicle.fields.make')} value={make} onChangeText={setMake} placeholder={t('onboarding.vehicle.placeholders.make')} />
              </View>
              <View style={styles.fieldHalf}>
                <Input theme={theme} label={t('onboarding.vehicle.fields.model')} value={model} onChangeText={setModel} placeholder={t('onboarding.vehicle.placeholders.model')} />
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Input theme={theme} label={t('onboarding.vehicle.fields.color')} value={color} onChangeText={setColor} placeholder={t('onboarding.vehicle.placeholders.color')} />
              </View>
              <View style={styles.fieldHalf}>
                <Input
                  theme={theme}
                  label={t('onboarding.vehicle.fields.plate')}
                  value={plateNumber}
                  onChangeText={setPlateNumber}
                  placeholder={t('onboarding.vehicle.placeholders.plate')}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            <View style={[styles.seatsSection, { borderTopColor: theme.outlineVariant }]}>
              <Text variant="label" color={theme.inkMuted}>
                {t('onboarding.vehicle.seatCount')}
              </Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: theme.surfaceMuted }]}
                  onPress={() => setSeatCount((s) => Math.max(1, s - 1))}
                  accessibilityRole="button"
                  accessibilityLabel={t('onboarding.vehicle.removeSeat')}
                >
                  <Text variant="h3" color={theme.ink}>
                    −
                  </Text>
                </TouchableOpacity>
                <Text variant="h3" color={theme.ink} style={styles.stepperValue}>
                  {seatCount}
                </Text>
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: theme.surfaceMuted }]}
                  onPress={() => setSeatCount((s) => Math.min(8, s + 1))}
                  accessibilityRole="button"
                  accessibilityLabel={t('onboarding.vehicle.addSeat')}
                >
                  <Text variant="h3" color={theme.ink}>
                    +
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </GlassSurface>
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity
          style={[
            styles.cta,
            { backgroundColor: theme.ink },
            !canContinue && styles.ctaDisabled,
          ]}
          onPress={next}
          disabled={!canContinue}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.vehicle.continue')}
          accessibilityState={{ disabled: !canContinue }}
        >
            <Text variant="label" color={theme.onInk}>
              {t('onboarding.vehicle.continue')}
            </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerStepLabel: {
    flex: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  headerSpacer: {
    width: spacing.xl,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    marginTop: spacing.lg,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  title: {
    marginTop: spacing.xs,
  },
  subtitle: {
    marginTop: spacing.sm,
    marginBottom: spacing['2xl'],
    maxWidth: 320,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardEyebrow: {
    letterSpacing: 1,
    marginBottom: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldHalf: {
    flex: 1,
  },
  seatsSection: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 32,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
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
});
