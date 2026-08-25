import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '../../../src/state/store';
import { setLicenseUri } from '../../../src/state/driverOnboardingSlice';
import { CaptureCamera } from '../../../src/features/driver-onboarding/CaptureCamera';

export default function LicenseCaptureScreen(): React.JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('driver');

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
      currentStep={2}
      totalSteps={4}
      onBack={() => router.back()}
      onCapture={(uri) => {
        dispatch(setLicenseUri(uri));
        router.push('/driver/onboarding/insurance');
      }}
    />
  );
}
