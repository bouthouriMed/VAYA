import { Stack } from 'expo-router';
import { useAppTheme } from '@vaya/design-system';

export default function SearchLayout(): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerTintColor: theme.ink,
        headerTitleStyle: { fontWeight: '700' },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="results" options={{ headerShown: false }} />
      <Stack.Screen name="ride-details" options={{ headerShown: false }} />
      <Stack.Screen name="trust" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="reviews" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="location" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="composer" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="pickup-point" options={{ headerShown: false, presentation: 'modal' }} />
    </Stack>
  );
}
