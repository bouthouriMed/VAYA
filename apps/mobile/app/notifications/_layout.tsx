import { Stack } from 'expo-router';

export default function NotificationsLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        // The screen renders its own themed header (back button, title,
        // unread count, safe-area padding). The native header previously
        // stacked a second "Notifications" title above it and — worse —
        // kept a static light `colors.gray100` background in dark mode,
        // leaving a white band behind the status bar over an otherwise
        // dark screen. Same call conversations/_layout.tsx already made.
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
