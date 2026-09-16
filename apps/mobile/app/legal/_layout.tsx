import { Stack } from 'expo-router';

export default function LegalLayout(): React.JSX.Element {
  // Same call as notifications/_layout.tsx and conversations/_layout.tsx:
  // the screen renders its own themed header, so the native stack header
  // (which doesn't follow app theme) stays off.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}
