import { Stack } from 'expo-router';
import { useAppTheme } from '@vaya/design-system';

/** Every search screen draws its own header (`ScreenHeader` or a floating
 *  map control), so the native header stays off. */
export default function SearchLayout(): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
      <Stack.Screen name="trust" options={{ presentation: 'modal' }} />
      <Stack.Screen name="composer" options={{ presentation: 'modal' }} />
      <Stack.Screen name="pickup-point" options={{ presentation: 'modal' }} />
      <Stack.Screen name="dropoff-point" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
