import { Stack } from 'expo-router';
import { colors } from '@vaya/design-system';

export default function SearchLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.gray100 },
        headerShadowVisible: false,
        headerTintColor: colors.gray900,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="results" options={{ title: '' }} />
      <Stack.Screen name="cluster" options={{ title: '' }} />
      <Stack.Screen name="trust" options={{ title: '', presentation: 'modal' }} />
    </Stack>
  );
}
