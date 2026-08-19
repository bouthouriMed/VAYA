import { Stack } from 'expo-router';
import { colors } from '@vaya/design-system';

export default function ConversationsLayout(): React.JSX.Element {
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
      <Stack.Screen name="[bookingId]" options={{ title: 'Messages' }} />
    </Stack>
  );
}
