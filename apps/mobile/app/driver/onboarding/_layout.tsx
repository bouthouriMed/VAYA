import { Stack } from 'expo-router';

export default function OnboardingWizardLayout(): React.JSX.Element {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: true }}>
      <Stack.Screen name="vehicle" />
      <Stack.Screen name="license" />
      <Stack.Screen name="insurance" />
      <Stack.Screen name="selfie" />
    </Stack>
  );
}
