import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider as ReduxProvider, useDispatch } from 'react-redux';
import { store, type AppDispatch } from '../src/state/store';
import { hydrateAuth } from '../src/state/authSlice';
import { loadTokens } from '../src/services/auth/tokenStorage';

function AuthHydrator({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  const dispatch = useDispatch<AppDispatch>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTokens().then((tokens) => {
      if (cancelled) return;
      dispatch(hydrateAuth(tokens));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // Nothing to show yet — this resolves in a handful of milliseconds
  // (SecureStore read), so a blank frame beats a flash of the wrong screen.
  if (!ready) return null;
  return <>{children}</>;
}

export default function RootLayout(): React.JSX.Element {
  return (
    <ReduxProvider store={store}>
      <AuthHydrator>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="search" />
          <Stack.Screen name="bookings" />
          <Stack.Screen name="driver" />
        </Stack>
      </AuthHydrator>
    </ReduxProvider>
  );
}
