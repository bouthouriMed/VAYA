import { Stack } from 'expo-router';
import { useAppTheme } from '@vaya/design-system';

/** Every booking screen draws its own `ScreenHeader` (or, for the live map,
 *  a floating back button) — the native header stays off so headers never
 *  stack or show a blank, off-theme bar. */
export default function BookingsLayout(): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
      <Stack.Screen name="confirmed" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
