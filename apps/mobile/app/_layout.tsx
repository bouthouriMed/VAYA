import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider as ReduxProvider, useDispatch } from 'react-redux';
import { colors, ToastProvider } from '@vaya/design-system';
import { store, type AppDispatch } from '../src/state/store';
import { hydrateAuth } from '../src/state/authSlice';
import { loadTokens } from '../src/services/auth/tokenStorage';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { useNotificationSetup } from '../src/services/notifications/useNotificationSetup';

function BrandedLoadingScreen(): React.JSX.Element {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.gray50,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

function AuthHydrator({ children }: { children: React.ReactNode }): React.JSX.Element {
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

  // This resolves in a handful of milliseconds (a SecureStore read), but a
  // branded frame beats a blank one for however long it takes.
  if (!ready) return <BrandedLoadingScreen />;
  return <>{children}</>;
}

/** Bridges expo-notifications' event streams (foreground delivery, tap) into
 *  the app — Toast display and deep-link routing (useNotificationSetup.ts).
 *  Mounted here, inside ToastProvider, so useToast() has a provider to read
 *  from; renders nothing itself. Listening doesn't request OS permission,
 *  so — unlike the permission request itself, which is contextual (see
 *  services/notifications/registerForPushNotifications.ts) — this is safe
 *  to run unconditionally from app start. */
function NotificationBridge(): null {
  useNotificationSetup();
  return null;
}

export default function RootLayout(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <ReduxProvider store={store}>
        <ToastProvider>
          <NotificationBridge />
          <AuthHydrator>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="search" />
              <Stack.Screen name="bookings" />
              <Stack.Screen name="driver" />
              <Stack.Screen name="notifications" />
            </Stack>
          </AuthHydrator>
        </ToastProvider>
      </ReduxProvider>
    </ErrorBoundary>
  );
}
