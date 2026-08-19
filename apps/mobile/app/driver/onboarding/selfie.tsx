import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Image, Animated, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  Button,
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
import { setSelfieUri, resetDriverOnboarding } from '../../../src/state/driverOnboardingSlice';
import { useUploadFileMutation, useCreateDriverOnboardingMutation } from '../../../src/state/api';
import { CaptureCamera } from '../../../src/features/driver-onboarding/CaptureCamera';

function fileFromUri(uri: string, name: string): FormData {
  const formData = new FormData();
  const match = /\.(\w+)$/.exec(uri);
  const ext = match?.[1] ?? 'jpg';
  formData.append('file', { uri, name: `${name}.${ext}`, type: `image/${ext}` } as unknown as Blob);
  return formData;
}

function ThumbCard({ uri, label }: { uri: string; label: string }): React.JSX.Element {
  return (
    <View style={styles.thumbCard}>
      <Image source={{ uri }} style={styles.thumbImage} />
      <View style={styles.thumbBadge}>
        <Ionicons name="checkmark" size={12} color={colors.white} />
      </View>
      <Text variant="bodySmall" color={colors.gray700} style={styles.thumbLabel}>
        {label}
      </Text>
    </View>
  );
}

export default function SelfieCaptureScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const draft = useAppSelector((s) => s.driverOnboarding);
  const [phase, setPhase] = useState<'capture' | 'review'>(draft.selfieUri ? 'review' : 'capture');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const [uploadFile] = useUploadFileMutation();
  const [createOnboarding, { isLoading: isSubmitting }] = useCreateDriverOnboardingMutation();

  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    if (phase !== 'review') return;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        fade.setValue(1);
        scale.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === 'capture') {
    return (
      <CaptureCamera
        facing="front"
        guideShape="face"
        title="Vérification d'identité"
        instruction="Centrez votre visage dans le cercle, dans un endroit bien éclairé."
        currentStep={4}
        totalSteps={4}
        onBack={() => router.back()}
        onCapture={(uri) => {
          dispatch(setSelfieUri(uri));
          setPhase('review');
        }}
      />
    );
  }

  const { vehicle, licenseUri, insuranceUri, selfieUri } = draft;
  if (!vehicle || !licenseUri || !insuranceUri || !selfieUri) {
    // Shouldn't happen via normal navigation — bail to the start of the wizard.
    router.replace('/driver/onboarding/vehicle');
    return <View style={styles.container} />;
  }

  async function submit(): Promise<void> {
    setErrorMessage(undefined);
    try {
      const [licenseUpload, insuranceUpload, selfieUpload] = await Promise.all([
        uploadFile(fileFromUri(licenseUri!, 'license')).unwrap(),
        uploadFile(fileFromUri(insuranceUri!, 'insurance')).unwrap(),
        uploadFile(fileFromUri(selfieUri!, 'selfie')).unwrap(),
      ]);
      await createOnboarding({
        vehicle: vehicle!,
        documents: [
          { type: 'license', fileUrl: licenseUpload.url },
          { type: 'insurance', fileUrl: insuranceUpload.url },
          { type: 'selfie', fileUrl: selfieUpload.url },
        ],
      }).unwrap();
      dispatch(resetDriverOnboarding());
      router.replace('/driver/publish');
    } catch {
      setErrorMessage("Impossible d'activer votre profil conducteur. Réessayez.");
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <ScreenHeader onBack={() => setPhase('capture')} title="Vérifier et confirmer" />
        <StepProgress currentStep={4} totalSteps={4} style={styles.stepProgress} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View style={{ opacity: fade, transform: [{ scale }] }}>
          <RoutePulseBadge icon="shield-checkmark" size="md" tone="onCream" />
          <Text variant="caption" color={colors.secondaryDark} style={styles.eyebrow}>
            DERNIÈRE ÉTAPE
          </Text>
          <Text variant="h2" style={styles.title}>
            Tout est prêt
          </Text>
          <Text variant="body" color={colors.gray600} style={styles.subtitle}>
            Vérifiez vos informations avant d&apos;activer votre profil conducteur.
          </Text>

          <View style={styles.card}>
            <Text variant="label" color={colors.gray400} style={styles.cardEyebrow}>
              VÉHICULE
            </Text>
            <View style={styles.vehicleRow}>
              <View style={styles.vehicleIcon}>
                <Ionicons name="car-sport-outline" size={20} color={colors.gray900} />
              </View>
              <View>
                <Text variant="label">
                  {vehicle.make} {vehicle.model} · {vehicle.color}
                </Text>
                <Text variant="bodySmall" color={colors.gray600}>
                  {vehicle.plateNumber} · {vehicle.seatCount} places
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text variant="label" color={colors.gray400} style={styles.cardEyebrow}>
              DOCUMENTS VÉRIFIÉS EN DIRECT
            </Text>
            <View style={styles.thumbRow}>
              <ThumbCard uri={licenseUri} label="Permis" />
              <ThumbCard uri={insuranceUri} label="Assurance" />
              <ThumbCard uri={selfieUri} label="Identité" />
            </View>
          </View>

          {errorMessage ? (
            <Text variant="bodySmall" color={colors.error} align="center" style={styles.error}>
              {errorMessage}
            </Text>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label="Confirmer et activer mon profil"
          size="lg"
          loading={isSubmitting}
          onPress={() => void submit()}
          style={styles.cta}
        />
      </View>
    </View>
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
    gap: spacing.sm,
    marginBottom: spacing.md,
    ...elevation?.md,
    shadowColor: colors.gray900,
  },
  cardEyebrow: {
    letterSpacing: 1,
    marginBottom: 2,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  vehicleIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thumbCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  thumbImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.gray200,
    ...elevation?.sm,
    shadowColor: colors.gray900,
  },
  thumbBadge: {
    position: 'absolute',
    top: -6,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  thumbLabel: {
    fontWeight: typography.fontWeight.medium,
  },
  error: {
    marginTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.gray100,
  },
  cta: {
    width: '100%',
    ...elevation?.lg,
    shadowColor: colors.primary,
  },
});
