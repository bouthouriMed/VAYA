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
import { Text, Icon, Input, GlassSurface, useAppTheme, spacing, radii } from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../../src/state/store';
import { setVehicleDraft } from '../../../src/state/driverOnboardingSlice';

const TOTAL_STEPS = 4;

export default function VehicleStepScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
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
            accessibilityLabel="Retour"
          >
            <Icon name="arrow-back" size="sm" color={theme.ink} />
          </TouchableOpacity>
          <Text variant="h3" color={theme.ink} style={styles.headerTitle}>
            Étape 1 sur {TOTAL_STEPS}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.outlineVariant }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: theme.ink, width: `${(1 / TOTAL_STEPS) * 100}%` },
            ]}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fade }}>
          <View style={[styles.badge, { backgroundColor: theme.surfaceMuted }]}>
            <Icon name="car-sport" size="lg" color={theme.ink} />
          </View>
          <Text variant="label" color={theme.inkFaint} style={styles.eyebrow}>
            PROFIL CONDUCTEUR
          </Text>
          <Text variant="h2" color={theme.ink} style={styles.title}>
            Votre véhicule
          </Text>
          <Text variant="body" color={theme.inkMuted} style={styles.subtitle}>
            Ces informations apparaissent sur votre profil conducteur pour rassurer vos passagers.
          </Text>

          <GlassSurface theme={theme} radius="2xl" style={styles.card}>
            <Text variant="label" color={theme.inkFaint} style={styles.cardEyebrow}>
              DÉTAILS DU VÉHICULE
            </Text>
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Input theme={theme} label="Marque" value={make} onChangeText={setMake} placeholder="Peugeot" />
              </View>
              <View style={styles.fieldHalf}>
                <Input theme={theme} label="Modèle" value={model} onChangeText={setModel} placeholder="208" />
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Input theme={theme} label="Couleur" value={color} onChangeText={setColor} placeholder="Grise" />
              </View>
              <View style={styles.fieldHalf}>
                <Input
                  theme={theme}
                  label="Plaque"
                  value={plateNumber}
                  onChangeText={setPlateNumber}
                  placeholder="208TU1234"
                  autoCapitalize="characters"
                />
              </View>
            </View>

            <View style={[styles.seatsSection, { borderTopColor: theme.outlineVariant }]}>
              <Text variant="label" color={theme.inkMuted}>
                Nombre de places passagers
              </Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: theme.surfaceMuted }]}
                  onPress={() => setSeatCount((s) => Math.max(1, s - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer une place"
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
                  accessibilityLabel="Ajouter une place"
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
          accessibilityLabel="Continuer"
          accessibilityState={{ disabled: !canContinue }}
        >
          <Text variant="label" color={theme.onInk}>
            Continuer
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: spacing.xl,
  },
  progressTrack: {
    height: 2,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
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
    fontWeight: '700',
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
