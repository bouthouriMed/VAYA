import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '../../../src/state/store';
import { setInsuranceUri } from '../../../src/state/driverOnboardingSlice';
import { CaptureCamera } from '../../../src/features/driver-onboarding/CaptureCamera';

export default function InsuranceCaptureScreen(): React.JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('driver');

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
      currentStep={3}
      totalSteps={4}
      onBack={() => router.back()}
      onCapture={(uri) => {
        dispatch(setInsuranceUri(uri));
        router.push('/driver/onboarding/selfie');
      }}
    />
  );
}
