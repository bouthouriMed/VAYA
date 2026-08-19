import { router } from 'expo-router';
import { useAppDispatch } from '../../../src/state/store';
import { setInsuranceUri } from '../../../src/state/driverOnboardingSlice';
import { CaptureCamera } from '../../../src/features/driver-onboarding/CaptureCamera';

export default function InsuranceCaptureScreen(): React.JSX.Element {
  const dispatch = useAppDispatch();

  return (
    <CaptureCamera
      facing="back"
      guideShape="document"
      title="Assurance véhicule"
      instruction="Placez votre attestation d'assurance dans le cadre, bien à plat et lisible."
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
