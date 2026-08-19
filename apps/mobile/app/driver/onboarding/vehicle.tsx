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
import {
  Text,
  Button,
  Input,
  StepProgress,
  ScreenHeader,
  RoutePulseBadge,
  colors,
  spacing,
  radii,
  elevation,
  typography,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../../src/state/store';
import { setVehicleDraft } from '../../../src/state/driverOnboardingSlice';

const TOTAL_STEPS = 4;

export default function VehicleStepScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <ScreenHeader onBack={() => router.back()} title={`Étape 1 sur ${TOTAL_STEPS}`} />
        <StepProgress currentStep={1} totalSteps={TOTAL_STEPS} style={styles.stepProgress} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fade }}>
          <RoutePulseBadge icon="car-sport" size="md" tone="onCream" />
          <Text variant="caption" color={colors.secondaryDark} style={styles.eyebrow}>
            PROFIL CONDUCTEUR
          </Text>
          <Text variant="h2" style={styles.title}>
            Votre véhicule
          </Text>
          <Text variant="body" color={colors.gray600} style={styles.subtitle}>
            Ces informations apparaissent sur votre profil conducteur pour rassurer vos passagers.
          </Text>

          <View style={styles.card}>
            <Text variant="label" color={colors.gray500} style={styles.cardEyebrow}>
              DÉTAILS DU VÉHICULE
            </Text>
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Input label="Marque" value={make} onChangeText={setMake} placeholder="Peugeot" />
              </View>
              <View style={styles.fieldHalf}>
                <Input label="Modèle" value={model} onChangeText={setModel} placeholder="208" />
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Input label="Couleur" value={color} onChangeText={setColor} placeholder="Grise" />
              </View>
              <View style={styles.fieldHalf}>
                <Input
                  label="Plaque"
                  value={plateNumber}
                  onChangeText={setPlateNumber}
                  placeholder="208TU1234"
                  autoCapitalize="characters"
                />
              </View>
            </View>

            <View style={styles.seatsSection}>
              <Text variant="label" color={colors.gray700}>
                Nombre de places passagers
              </Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setSeatCount((s) => Math.max(1, s - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer une place"
                >
                  <Text variant="h3" color={colors.primary}>
                    −
                  </Text>
                </TouchableOpacity>
                <Text variant="h3" style={styles.stepperValue}>
                  {seatCount}
                </Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setSeatCount((s) => Math.min(8, s + 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter une place"
                >
                  <Text variant="h3" color={colors.primary}>
                    +
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label="Continuer"
          size="lg"
          disabled={!canContinue}
          onPress={next}
          style={styles.cta}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  header: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  stepProgress: {
    marginBottom: spacing.sm,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  eyebrow: {
    marginTop: spacing.lg,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.5,
  },
  title: {
    marginTop: spacing.xs,
    fontWeight: typography.fontWeight.bold,
  },
  subtitle: {
    marginTop: spacing.sm,
    marginBottom: spacing['2xl'],
    maxWidth: 320,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
    ...elevation?.lg,
    shadowColor: colors.gray900,
  },
  cardEyebrow: {
    color: colors.gray400,
    letterSpacing: 1,
    marginBottom: spacing.xs,
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
    borderTopColor: colors.gray100,
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
    backgroundColor: colors.gray100,
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
    backgroundColor: colors.gray100,
  },
  cta: {
    width: '100%',
  },
});
