import { Stack } from 'expo-router';

export default function DriverLayout(): React.JSX.Element {
  // headerShown: false everywhere — the onboarding wizard and publish screen
  // each build their own on-brand header (back arrow + step progress),
  // consistent with the rest of the app (otp.tsx, trust.tsx, etc.) rather
  // than the plain native stack header.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="publish" />
    </Stack>
  );
}
