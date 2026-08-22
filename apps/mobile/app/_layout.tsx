import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider as ReduxProvider, useDispatch } from 'react-redux';
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_500Medium_Italic,
} from '@expo-google-fonts/fraunces';
import { colors, ToastProvider, AppThemeProvider, useAppTheme } from '@vaya/design-system';
import { store, useAppSelector, type AppDispatch } from '../src/state/store';
import { hydrateAuth } from '../src/state/authSlice';
import { hydrateAppearance } from '../src/state/appearanceSlice';
import { loadTokens } from '../src/services/auth/tokenStorage';
import { loadAppearancePreference } from '../src/services/settings/appearanceStorage';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { useNotificationSetup } from '../src/services/notifications/useNotificationSetup';
import { RatingPromptBridge } from '../src/features/ratings/RatingPromptBridge';
import { RecurringPatternPromptBridge } from '../src/features/recurring/RecurringPatternPromptBridge';

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

/** Status-bar icon polarity follows the live app scheme — dark glyphs over
 *  light chrome, light glyphs once the app runs dark. Rendered above the
 *  navigator (not inside AuthHydrator) so the polarity also holds during
 *  font-loading and token-hydration frames instead of falling back to
 *  expo-router's OS-scheme guess, which can disagree with a forced scheme. */
function ThemedStatusBar(): React.JSX.Element {
  const { scheme } = useAppTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

/** Sits inside ReduxProvider so it can read the appearance slice and feed
 *  the resolved preference into AppThemeProvider: `'system'` passes no
 *  override (the provider follows useColorScheme()), while `'light'`/
 *  `'dark'` pin the scheme the user picked in profile.tsx. Also hydrates
 *  the persisted preference once on mount — until that resolves, `'system'`
 *  is the store's initial state, so a pinned user sees at most one
 *  system-scheme frame before their choice lands. */
function ThemedApp({ children }: { children: React.ReactNode }): React.JSX.Element {
  const dispatch = useDispatch<AppDispatch>();
  const preference = useAppSelector((s) => s.appearance.preference);

  useEffect(() => {
    let cancelled = false;
    loadAppearancePreference().then((persisted) => {
      if (!cancelled) dispatch(hydrateAppearance(persisted));
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  return (
    <AppThemeProvider scheme={preference === 'system' ? undefined : preference}>
      <ToastProvider>{children}</ToastProvider>
    </AppThemeProvider>
  );
}

export default function RootLayout(): React.JSX.Element {
  // Fraunces (the brand's editorial-serif display face — see
  // packages/design-system/src/tokens/typography.ts) must be registered
  // before any `display*` Text variant renders, or RN silently falls back
  // to the system font for that first frame. Same "branded frame beats a
  // blank/wrong one" reasoning as AuthHydrator below.
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_500Medium_Italic,
  });

  if (!fontsLoaded) return <BrandedLoadingScreen />;

  return (
    // Required root for react-native-gesture-handler (BottomSheet's real
    // drag-to-dismiss) — without it, gesture recognizers silently fail to
    // register anywhere in the tree. Neither Expo Router nor React
    // Navigation provides this automatically; it must be mounted once here.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        {/* ReduxProvider sits above the theme provider on purpose: the
         *  appearance preference lives in the store (set from profile.tsx's
         *  Apparence sheet) and ThemedApp needs to read it to decide what
         *  scheme AppThemeProvider should run. Follows 'system' by default;
         *  the Stitch rider flow (explore → search → booking request) is
         *  fully dual-scheme via theme/palette.ts, including edge-to-edge
         *  surfaces like explore's map + StatusBarBlend. Legacy-token
         *  surfaces keep their own static light palettes until they're
         *  migrated to useAppTheme(). */}
        <ReduxProvider store={store}>
          <ThemedApp>
            <ToastProvider>
              <NotificationBridge />
              <RatingPromptBridge />
              <RecurringPatternPromptBridge />
              <ThemedStatusBar />
              <AuthHydrator>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="sign-in" />
                  <Stack.Screen name="(auth)" />
                  {/* The Google OAuth deep link's real fallback landing pad
                   *  (auth/google.tsx) — see that file's doc comment for why
                   *  this needs to be a registered route at all. */}
                  <Stack.Screen name="auth" />
                  {/* gestureEnabled: false — (tabs) sits after index/(auth) in
                   *  this stack, so it has a real screen underneath to pop
                   *  back to, and native-stack's default edge swipe-back
                   *  gesture (drag rightward from the left edge) was live on
                   *  it. That's not a hypothetical: it's exactly what fired
                   *  when dragging right inside DateCalendarSheet's month
                   *  grid — a gesture entirely outside our own
                   *  GestureDetector/reanimated code, popping the whole main
                   *  app UI back to auth. Nothing legitimate should ever
                   *  swipe-navigate away from the main app's tabs. */}
                  <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="search" />
                  <Stack.Screen name="bookings" />
                  <Stack.Screen name="driver" />
                  <Stack.Screen name="notifications" />
                  <Stack.Screen name="conversations" />
                  <Stack.Screen name="recurring" />
                </Stack>
              </AuthHydrator>
            </ToastProvider>
          </ThemedApp>
        </ReduxProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
