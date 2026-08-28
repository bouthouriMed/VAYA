import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Animated,
  AccessibilityInfo,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Text,
  Icon,
  GlassSurface,
  StepProgress,
  useAppTheme,
  haptics,
  spacing,
  radii,
  type AppPalette,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../../src/state/store';
import { setSelfieUri, resetDriverOnboarding } from '../../../src/state/driverOnboardingSlice';
import {
  useUploadSecureFileMutation,
  useCreateDriverOnboardingMutation,
  useCreateRideMutation,
  usePublishRideMutation,
} from '../../../src/state/api';
import { CaptureCamera } from '../../../src/features/driver-onboarding/CaptureCamera';
import { describeVerificationSubmitError } from '../../../src/features/driver-onboarding/verificationErrors';
import { trackEvent } from '../../../src/services/analytics/analytics';

function fileFromUri(uri: string, name: string): FormData {
  const formData = new FormData();
  const match = /\.(\w+)$/.exec(uri);
  const ext = match?.[1] ?? 'jpg';
  formData.append('file', { uri, name: `${name}.${ext}`, type: `image/${ext}` } as unknown as Blob);
  return formData;
}

function ThumbCard({
  theme,
  uri,
  label,
}: {
  theme: AppPalette;
  uri: string;
  label: string;
}): React.JSX.Element {
  return (
    <View style={styles.thumbCard}>
      <Image source={{ uri }} style={styles.thumbImage} />
      <View style={[styles.thumbBadge, { backgroundColor: theme.accent, borderColor: theme.surface }]}>
        <Icon name="checkmark" size="xs" color={theme.onAccent} />
      </View>
      <Text variant="bodySmall" color={theme.inkMuted} style={styles.thumbLabel}>
        {label}
      </Text>
    </View>
  );
}

export default function SelfieCaptureScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const { t } = useTranslation('driver');
  const dispatch = useAppDispatch();
  const draft = useAppSelector((s) => s.driverOnboarding);
  const [phase, setPhase] = useState<'capture' | 'review'>(draft.selfieUri ? 'review' : 'capture');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const [uploadSecureFile] = useUploadSecureFileMutation();
  const [createOnboarding, { isLoading: isSubmitting }] = useCreateDriverOnboardingMutation();
  const [createRide] = useCreateRideMutation();
  const [publishRide] = usePublishRideMutation();

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

  // Shouldn't happen via normal navigation — bail to the start of the
  // wizard if this screen is somehow reached without everything the
  // submit step needs. The redirect must run from an effect, not inline
  // during render: calling router.replace() directly in the render body
  // updates the navigation container while this component is still
  // rendering, which is exactly what produced the "Cannot update a
  // component (NavigationContainerInner) while rendering a different
  // component (SelfieCaptureScreen)" warning reported on this screen.
  const missingRequiredAssets =
    !draft.vehicle || !draft.licenseUri || !draft.insuranceUri || !draft.selfieUri;
  useEffect(() => {
    if (phase === 'review' && missingRequiredAssets) {
      router.replace('/driver/onboarding/vehicle');
    }
  }, [phase, missingRequiredAssets]);

  if (phase === 'capture') {
    return (
      <CaptureCamera
        facing="front"
        guideShape="face"
        title={t('onboarding.selfie.captureTitle')}
        eyebrow={t('onboarding.selfie.captureTitle')}
        instruction={t('onboarding.selfie.captureInstruction')}
        tips={[
          { icon: 'eye-outline', label: t('onboarding.selfie.tipFace') },
          { icon: 'glasses-outline', label: t('onboarding.selfie.tipGlasses') },
          { icon: 'sunny-outline', label: t('onboarding.selfie.tipLight') },
        ]}
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
    // The effect above handles the actual redirect; render nothing while
    // it fires.
    return <View style={styles.container} />;
  }

  async function submit(): Promise<void> {
    setErrorMessage(undefined);
    // Captured before the reset below clears them — carried in from the
    // publish flow's review screen (driver/publish.tsx's startVerification)
    // when this wizard was entered mid-publish (stitch/verification's
    // requirement-prompt + confirmation-pending screens promise the ride
    // publishes automatically once verification completes). Exactly one of
    // the two is ever set: `pendingRide` when a real draft ride already
    // existed (had a vehicle), `pendingRideDraft` when it didn't yet.
    const { pendingRide, pendingRideDraft } = draft;
    const originLabel = pendingRide?.originLabel ?? pendingRideDraft?.originLabel ?? '';
    const destinationLabel =
      pendingRide?.destinationLabel ?? pendingRideDraft?.destinationLabel ?? '';
    // Which of the submit's two phases failed — uploads vs profile creation —
    // so the rendered error can say what actually went wrong.
    let stage: 'documents' | 'profile' = 'documents';
    try {
      // Driver KYC documents go through /uploads/secure, not the public
      // /uploads endpoint avatar/vehicle photos use (docs/domain/
      // verification-workflow.md's "Document security" section — a real
      // gap fixed alongside this feature: these files must never be
      // reachable by anyone who merely learns the URL).
      const [licenseUpload, insuranceUpload, selfieUpload] = await Promise.all([
        uploadSecureFile(fileFromUri(licenseUri!, 'license')).unwrap(),
        uploadSecureFile(fileFromUri(insuranceUri!, 'insurance')).unwrap(),
        uploadSecureFile(fileFromUri(selfieUri!, 'selfie')).unwrap(),
      ]);
      stage = 'profile';
      const onboardingProfile = await createOnboarding({
        vehicle: vehicle!,
        documents: [
          { type: 'license', fileUrl: licenseUpload.url },
          { type: 'insurance', fileUrl: insuranceUpload.url },
          { type: 'selfie', fileUrl: selfieUpload.url },
        ],
      }).unwrap();
      dispatch(resetDriverOnboarding());

      if (!pendingRide && !pendingRideDraft) {
        router.replace('/(tabs)/publish');
        return;
      }

      let publishedOk = false;
      try {
        if (pendingRide) {
          await publishRide(pendingRide.rideId).unwrap();
          publishedOk = true;
        } else if (pendingRideDraft) {
          const newVehicle = onboardingProfile.vehicles[0];
          if (newVehicle) {
            const created = await createRide({
              vehicleId: newVehicle.id,
              origin: {
                label: pendingRideDraft.originLabel,
                lat: pendingRideDraft.originLat,
                lng: pendingRideDraft.originLng,
              },
              destination: {
                label: pendingRideDraft.destinationLabel,
                lat: pendingRideDraft.destinationLat,
                lng: pendingRideDraft.destinationLng,
              },
              departureAt: new Date(pendingRideDraft.departureAt),
              seatsTotal: pendingRideDraft.seatsTotal,
            }).unwrap();
            await publishRide(created.id).unwrap();
            publishedOk = true;
          }
        }
      } catch {
        trackEvent('ride_auto_publish_after_verification_failed', {
          rideId: pendingRide?.rideId,
        });
      }

      router.replace({
        pathname: '/driver/onboarding/confirmation',
        params: {
          originLabel,
          destinationLabel,
          status: publishedOk ? 'done' : 'error',
        },
      });
    } catch (err) {
      const info = describeVerificationSubmitError(err, stage);
      if (info.kind === 'conflict') {
        // The server's only CONFLICT trigger on createOnboarding is a
        // pre-existing driver_profile — this used to mean verification was
        // genuinely already done, back when createOnboarding always
        // synchronously auto-approved. That's no longer true (docs/domain/
        // verification-workflow.md): a pre-existing profile could just as
        // easily be pending/under_review/resubmission_required/rejected.
        // Route to the real confirmation screen without asserting a status
        // this branch can't actually back — it derives the true state
        // itself from useGetMyDriverProfileQuery.
        dispatch(resetDriverOnboarding());
        router.replace({ pathname: '/driver/onboarding/confirmation', params: { originLabel, destinationLabel } });
        return;
      }
      setErrorMessage(info.message);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => {
              haptics.selection();
              setPhase('capture');
            }}
            hitSlop={12}
            accessibilityRole="button"
          accessibilityLabel={t('onboarding.index.back')}
          >
            <Icon name="arrow-back" size="sm" color={theme.ink} />
          </TouchableOpacity>
          <Text variant="h3" color={theme.ink} style={styles.headerTitle}>
            {t('onboarding.selfie.reviewTitle')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <StepProgress currentStep={4} totalSteps={4} theme={theme} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View style={{ opacity: fade, transform: [{ scale }] }}>
          <View style={[styles.heroBadge, { backgroundColor: theme.surfaceMuted }]}>
            <Icon name="shield-checkmark" size="lg" color={theme.ink} />
          </View>
          <Text variant="label" color={theme.inkFaint} style={styles.eyebrow}>
            {t('onboarding.selfie.reviewEyebrow')}
          </Text>
          <Text variant="h2" color={theme.ink} style={styles.title}>
            {t('onboarding.selfie.reviewHeadline')}
          </Text>
          <Text variant="body" color={theme.inkMuted} style={styles.subtitle}>
            {t('onboarding.selfie.reviewSubtitle')}
          </Text>

          <GlassSurface theme={theme} radius="2xl" style={styles.card}>
            <Text variant="label" color={theme.inkFaint} style={styles.cardEyebrow}>
              {t('onboarding.selfie.vehicleSection')}
            </Text>
            <View style={styles.vehicleRow}>
              <View style={[styles.vehicleIcon, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="car-sport-outline" size="sm" color={theme.ink} />
              </View>
              <View>
                <Text variant="label" color={theme.ink}>
                  {vehicle.make} {vehicle.model} · {vehicle.color}
                </Text>
                <Text variant="bodySmall" color={theme.inkMuted}>
                  {vehicle.plateNumber} · {vehicle.seatCount} places
                </Text>
              </View>
            </View>
          </GlassSurface>

          <GlassSurface theme={theme} radius="2xl" style={styles.card}>
            <Text variant="label" color={theme.inkFaint} style={styles.cardEyebrow}>
              {t('onboarding.selfie.documentsSection')}
            </Text>
            <View style={styles.thumbRow}>
              <ThumbCard theme={theme} uri={licenseUri} label={t('onboarding.selfie.tabs.license')} />
              <ThumbCard theme={theme} uri={insuranceUri} label={t('onboarding.selfie.tabs.insurance')} />
              <ThumbCard theme={theme} uri={selfieUri} label={t('onboarding.selfie.tabs.identity')} />
            </View>
          </GlassSurface>

          {errorMessage ? (
            <Text variant="bodySmall" color={theme.error} align="center" style={styles.error}>
              {errorMessage}
            </Text>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg, backgroundColor: theme.background }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: theme.ink }, isSubmitting && styles.ctaDisabled]}
          onPress={() => {
            haptics.selection();
            void submit();
          }}
          disabled={isSubmitting}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={errorMessage ? t('onboarding.selfie.reviewRetake') : t('onboarding.selfie.reviewConfirm')}
          accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
        >
          {isSubmitting ? (
            <ActivityIndicator color={theme.onInk} />
          ) : (
            <Text variant="label" color={theme.onInk}>
              {errorMessage ? t('onboarding.selfie.reviewRetake') : t('onboarding.selfie.reviewConfirm')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
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
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  heroBadge: {
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
    gap: spacing.sm,
    marginBottom: spacing.md,
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
  },
  thumbBadge: {
    position: 'absolute',
    top: -6,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  thumbLabel: {
    fontWeight: '500',
  },
  error: {
    marginTop: spacing.sm,
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
