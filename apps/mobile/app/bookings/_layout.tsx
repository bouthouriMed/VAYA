import { Stack } from 'expo-router';
import { colors } from '@vaya/design-system';

export default function BookingsLayout(): React.JSX.Element {
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
      <Stack.Screen name="pending" options={{ title: '' }} />
      <Stack.Screen name="pickup" options={{ title: '' }} />
      <Stack.Screen name="live" options={{ title: 'En voiture' }} />
      <Stack.Screen
        name="settlement"
        options={{
          title: '',
          headerTransparent: true,
          headerTintColor: colors.navyText,
        }}
      />
    </Stack>
  );
}
