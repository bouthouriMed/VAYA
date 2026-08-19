import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Input, StepProgress, colors, spacing, radii } from '@vaya/design-system';
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
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.gray900} />
          </TouchableOpacity>
          <Text variant="label" color={colors.gray600}>
            Étape 1 sur {TOTAL_STEPS}
          </Text>
          <View style={styles.backBtn} />
        </View>
        <StepProgress currentStep={1} totalSteps={TOTAL_STEPS} style={styles.stepProgress} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heroIcon}>
          <Ionicons name="car-sport" size={30} color={colors.white} />
        </View>
        <Text variant="h2" style={styles.title}>
          Votre véhicule
        </Text>
        <Text variant="body" color={colors.gray600} style={styles.subtitle}>
          Ces informations apparaissent sur votre profil conducteur pour rassurer vos passagers.
        </Text>

        <View style={styles.card}>
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
              >
                <Text variant="h3">−</Text>
              </TouchableOpacity>
              <Text variant="h3" style={styles.stepperValue}>
                {seatCount}
              </Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setSeatCount((s) => Math.min(8, s + 1))}
              >
                <Text variant="h3">+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepProgress: {
    marginBottom: spacing.sm,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    maxWidth: 320,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
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
    marginTop: spacing.xs,
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
