import { Stack } from 'expo-router';
import { colors } from '@vaya/design-system';

export default function DriverLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.gray100 },
        headerShadowVisible: false,
        headerTintColor: colors.gray900,
        headerTitleStyle: { fontWeight: '700' },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="onboarding" options={{ title: 'Devenir conducteur' }} />
      <Stack.Screen name="publish" options={{ title: 'Publier un trajet' }} />
    </Stack>
  );
}
