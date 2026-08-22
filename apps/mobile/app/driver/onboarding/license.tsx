import { router } from 'expo-router';
import { useAppDispatch } from '../../../src/state/store';
import { setLicenseUri } from '../../../src/state/driverOnboardingSlice';
import { CaptureCamera } from '../../../src/features/driver-onboarding/CaptureCamera';

export default function LicenseCaptureScreen(): React.JSX.Element {
  const dispatch = useAppDispatch();

  return (
    <CaptureCamera
      facing="back"
      guideShape="document"
      title="Permis de conduire"
      eyebrow="Permis de conduire"
      instruction="Placez votre permis de conduire dans le cadre, bien à plat et lisible."
      tips={[
        { icon: 'sunny-outline', label: 'Assurez-vous d’avoir un bon éclairage' },
        { icon: 'flash-off-outline', label: 'Évitez les reflets, surtout avec le flash' },
        { icon: 'scan-outline', label: 'Les 4 coins du document doivent être visibles' },
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
