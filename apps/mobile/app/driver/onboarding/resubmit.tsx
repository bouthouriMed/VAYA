import { useState } from 'react';
import { View, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text, Icon, GlassSurface, useAppTheme, haptics, spacing, radii } from '@vaya/design-system';
import { router } from 'expo-router';
import {
  useGetMyDriverProfileQuery,
  useUploadSecureFileMutation,
  useResubmitVerificationMutation,
} from '../../../src/state/api';
import { CaptureCamera } from '../../../src/features/driver-onboarding/CaptureCamera';
import { verificationDeclineReasonKey } from '../../../src/features/driver-onboarding/verificationDeclineCopy';

type Phase = 'license' | 'insurance' | 'selfie' | 'review';

function fileFromUri(uri: string, name: string): FormData {
  const formData = new FormData();
  const match = /\.(\w+)$/.exec(uri);
  const ext = match?.[1] ?? 'jpg';
  formData.append('file', { uri, name: `${name}.${ext}`, type: `image/${ext}` } as unknown as Blob);
  return formData;
}

/**
 * Reachable only when `driverProfile.verificationStatus ===
 * 'resubmission_required'` (docs/domain/verification-workflow.md) — the
 * driver's real, structured decline reason + required admin message are
 * shown non-punitively (CLAUDE.md: "the user should never feel stuck or
 * punished") before re-capturing all three documents through the SAME
 * live `CaptureCamera` flow onboarding uses ("documents en direct — jamais
 * depuis la galerie" is a protected differentiator; no second gallery-
 * upload path exists here). All three are re-captured, not just the one
 * the decline reason names — the backend replaces the whole document set
 * on resubmission (per-submission decline, not per-document; see the
 * design doc's stated limitation).
 */
export default function ResubmitVerificationScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const { t } = useTranslation('driver');
  const { data: driverProfile, isLoading: isProfileLoading } = useGetMyDriverProfileQuery();
  const [phase, setPhase] = useState<Phase>('license');
  const [licenseUri, setLicenseUri] = useState<string | null>(null);
  const [insuranceUri, setInsuranceUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [uploadSecureFile] = useUploadSecureFileMutation();
  const [resubmitVerification, { isLoading: isSubmitting }] = useResubmitVerificationMutation();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  if (phase === 'license') {
    return (
      <CaptureCamera
        facing="back"
        guideShape="document"
        title={t('onboarding.license.title')}
        eyebrow={t('onboarding.license.eyebrow')}
        instruction={t('onboarding.license.instruction')}
        tips={[
          { icon: 'sunny-outline', label: t('onboarding.license.tipClear') },
          { icon: 'flash-off-outline', label: t('onboarding.license.tipValid') },
          { icon: 'scan-outline', label: t('onboarding.license.tipFull') },
        ]}
        currentStep={1}
        totalSteps={3}
        onBack={() => router.back()}
        onCapture={(uri) => {
          setLicenseUri(uri);
          setPhase('insurance');
        }}
      />
    );
  }

  if (phase === 'insurance') {
    return (
      <CaptureCamera
        facing="back"
        guideShape="document"
        title={t('onboarding.insurance.title')}
        eyebrow={t('onboarding.insurance.eyebrow')}
        instruction={t('onboarding.insurance.instruction')}
        tips={[
          { icon: 'checkmark-circle-outline', label: t('onboarding.insurance.tipValid') },
          { icon: 'car-outline', label: t('onboarding.insurance.tipClear') },
          { icon: 'calendar-outline', label: t('onboarding.insurance.tipFull') },
        ]}
        currentStep={2}
        totalSteps={3}
        onBack={() => setPhase('license')}
        onCapture={(uri) => {
          setInsuranceUri(uri);
          setPhase('selfie');
        }}
      />
    );
  }

  if (phase === 'selfie') {
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
        currentStep={3}
        totalSteps={3}
        onBack={() => setPhase('insurance')}
        onCapture={(uri) => {
          setSelfieUri(uri);
          setPhase('review');
        }}
      />
    );
  }

  // phase === 'review'
  async function submit(): Promise<void> {
    setErrorMessage(undefined);
    try {
      const [licenseUpload, insuranceUpload, selfieUpload] = await Promise.all([
        uploadSecureFile(fileFromUri(licenseUri!, 'license')).unwrap(),
        uploadSecureFile(fileFromUri(insuranceUri!, 'insurance')).unwrap(),
        uploadSecureFile(fileFromUri(selfieUri!, 'selfie')).unwrap(),
      ]);
      await resubmitVerification({
        documents: [
          { type: 'license', fileUrl: licenseUpload.url },
          { type: 'insurance', fileUrl: insuranceUpload.url },
          { type: 'selfie', fileUrl: selfieUpload.url },
        ],
      }).unwrap();
      router.replace('/driver/onboarding/confirmation');
    } catch {
      setErrorMessage(t('resubmit.submitError'));
    }
  }

  const declineReasonLabel = driverProfile?.verificationDeclineReason
    ? t(verificationDeclineReasonKey(driverProfile.verificationDeclineReason))
    : undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Icon name="arrow-back" size="sm" color={theme.ink} />
        </TouchableOpacity>
        <Text variant="h3" color={theme.ink} style={styles.headerTitle}>
          {t('resubmit.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isProfileLoading ? (
          <ActivityIndicator color={theme.accent} />
        ) : (
          <>
            {declineReasonLabel || driverProfile?.verificationDeclineMessage ? (
              <GlassSurface theme={theme} radius="2xl" style={styles.reasonCard}>
                {declineReasonLabel ? (
                  <View style={styles.reasonRow}>
                    <Icon name="alert-circle-outline" size="sm" color={theme.error} />
                    <Text variant="label" color={theme.ink}>
                      {declineReasonLabel}
                    </Text>
                  </View>
                ) : null}
                {driverProfile?.verificationDeclineMessage ? (
                  <Text variant="body" color={theme.inkMuted}>
                    {driverProfile.verificationDeclineMessage}
                  </Text>
                ) : null}
              </GlassSurface>
            ) : null}

            <Text variant="body" color={theme.inkMuted} style={styles.intro}>
              {t('resubmit.intro')}
            </Text>

            <GlassSurface theme={theme} radius="2xl" style={styles.card}>
              <Text variant="label" color={theme.inkFaint} style={styles.cardEyebrow}>
                {t('resubmit.documentsSection')}
              </Text>
              <View style={styles.thumbRow}>
                {[
                  { uri: licenseUri, label: t('onboarding.selfie.tabs.license') },
                  { uri: insuranceUri, label: t('onboarding.selfie.tabs.insurance') },
                  { uri: selfieUri, label: t('onboarding.selfie.tabs.identity') },
                ].map((doc) => (
                  <View key={doc.label} style={styles.thumbCard}>
                    {doc.uri ? <Image source={{ uri: doc.uri }} style={styles.thumbImage} /> : null}
                    <Text variant="bodySmall" color={theme.inkMuted}>
                      {doc.label}
                    </Text>
                  </View>
                ))}
              </View>
            </GlassSurface>

            {errorMessage ? (
              <Text variant="bodySmall" color={theme.error} align="center" style={styles.error}>
                {errorMessage}
              </Text>
            ) : null}
          </>
        )}
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
          accessibilityLabel={isSubmitting ? t('resubmit.submitting') : t('resubmit.submit')}
          accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
        >
          {isSubmitting ? (
            <ActivityIndicator color={theme.onInk} />
          ) : (
            <Text variant="label" color={theme.onInk}>
              {t('resubmit.submit')}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 24,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['4xl'],
  },
  reasonCard: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  intro: {
    marginBottom: spacing.xs,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardEyebrow: {
    letterSpacing: 1,
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
