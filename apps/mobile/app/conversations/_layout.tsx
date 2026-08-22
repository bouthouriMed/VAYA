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
      {/* The chat screen renders its own Stitch-style header (avatar,
          verified badge, live trip context bar) — the OS header is off so
          the two never stack. */}
      <Stack.Screen name="[bookingId]" options={{ headerShown: false }} />
    </Stack>
  );
}
