import { Stack } from 'expo-router';

export default function DriverLayout(): React.JSX.Element {
  // headerShown: false — the onboarding wizard builds its own on-brand
  // header, consistent with the rest of the app (otp.tsx, trust.tsx, etc.)
  // rather than the plain native stack header. The ride-creation wizard
  // itself now lives at (tabs)/publish.tsx, not in this stack, so the
  // bottom tab bar stays visible through it like every other tab.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="rides/[rideId]" />
      <Stack.Screen name="stops-selection" />
    </Stack>
  );
}
