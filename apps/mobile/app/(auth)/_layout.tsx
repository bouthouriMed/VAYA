import { Stack } from 'expo-router';
import { colors } from '@vaya/design-system';

export default function AuthLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        headerTitle: '',
        headerTintColor: colors.gray900,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="phone" />
      <Stack.Screen name="otp" />
    </Stack>
  );
}
