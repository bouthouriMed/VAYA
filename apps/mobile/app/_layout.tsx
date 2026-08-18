import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider as ReduxProvider } from 'react-redux';
import { store } from '../src/state/store';

export default function RootLayout(): React.JSX.Element {
  return (
    <ReduxProvider store={store}>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ title: 'VAYA' }} />
      </Stack>
    </ReduxProvider>
  );
}
