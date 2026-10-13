import { useEffect, useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Provider as ReduxProvider, useDispatch } from 'react-redux';
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_500Medium_Italic,
} from '@expo-google-fonts/fraunces';
import { NotoKufiArabic_500Medium, NotoKufiArabic_600SemiBold } from '@expo-google-fonts/noto-kufi-arabic';
import { ToastProvider, AppThemeProvider, useAppTheme, lightPalette, darkPalette } from '@vaya/design-system';
import { store, useAppSelector, type AppDispatch } from '../src/state/store';
import { hydrateAuth } from '../src/state/authSlice';
import { hydrateAppearance } from '../src/state/appearanceSlice';
import { hydrateLanguage } from '../src/state/languageSlice';
import { loadTokens } from '../src/services/auth/tokenStorage';
import { loadAppearancePreference } from '../src/services/settings/appearanceStorage';
import { readLanguagePreferenceSync } from '../src/services/settings/languageStorage';
import { initI18n, detectDeviceLocale } from '../src/services/i18n';
import { applyRtlDirection } from '../src/services/i18n/rtl';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { initMonitoring } from '../src/services/monitoring/sentry';
import { useNotificationSetup } from '../src/services/notifications/useNotificationSetup';
import { PushPermissionBridge } from '../src/services/notifications/PushPermissionBridge';
import { RatingPromptBridge } from '../src/features/ratings/RatingPromptBridge';
import { RecurringPatternPromptBridge } from '../src/features/recurring/RecurringPatternPromptBridge';

// Runs once at module load, before the first render — i18next and the
// native RTL flag must both be settled before any screen mounts. The
// user's explicit choice is read synchronously so the language is applied
// exactly once; the device locale is only the first-run fallback. (This
// used to start on the device locale and switch to the saved choice once
// an async read resolved — flipping RTL off then on again and reloading on
// every launch, which crashed iOS Expo Go permanently once Arabic was
// saved, since the Keychain-backed choice survives even a reinstall.) A
// direction change applied here takes effect from the next launch;
// startup never reloads the app.
const persistedLocale = readLanguagePreferenceSync();
const startupLocale = persistedLocale ?? detectDeviceLocale();
applyRtlDirection(startupLocale);
initI18n(startupLocale);

// Keeps the native splash (expo-splash-screen's config in app.config.js)
// on screen through Fraunces' async load below instead of the OS
// auto-hiding it the instant the JS thread starts — without this, a device
// would flash native-splash → BrandedLoadingScreen → real content instead
// of native-splash → real content, since BrandedLoadingScreen's whole
// purpose (a branded frame while fonts load) would otherwise render
// underneath/after a splash that's already gone. Failures are swallowed —
// worst case here is the native default (auto-hide), not a crash.
void SplashScreen.preventAutoHideAsync().catch(() => {});

initMonitoring();

function BrandedLoadingScreen(): React.JSX.Element {
  // Rendered before the theme provider mounts — picks the palette from the
  // device setting directly so a dark-mode launch never flashes light.
  const palette = useColorScheme() === 'dark' ? darkPalette : lightPalette;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator color={palette.accent} size="large" />
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

/** Mirrors the module-load locale (`startupLocale`, already active in
 *  i18next and the native RTL flag) into the language slice, noting
 *  whether it was the user's explicit choice or the device-locale
 *  fallback. Renders nothing. */
function LanguageHydrator(): null {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    dispatch(hydrateLanguage({ locale: startupLocale, isExplicit: persistedLocale !== null }));
  }, [dispatch]);

  return null;
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
 *  system-scheme frame before their choice lands.
 *
 *  Note: the actual ToastProvider is mounted once, further down in
 *  RootLayout — not here. A second one used to wrap `children` at this
 *  level too; since useToast() always resolves to the nearest provider,
 *  that outer one never received any toasts and just rendered a dead,
 *  permanently-empty stack view. */
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
      {children}
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
    NotoKufiArabic_500Medium,
    NotoKufiArabic_600SemiBold,
  });

  // Pairs with preventAutoHideAsync() above — hides the native splash only
  // once fonts are actually ready, so the transition is native-splash →
  // real (correctly-fonted) content, with BrandedLoadingScreen never
  // visible at all on a fast load and only briefly on a slow one.
  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Expo Router mounts its own SafeAreaProvider around the whole app, so
  // this resolves to the real per-device inset — what lets ToastProvider
  // clear the status bar / notch / Dynamic Island exactly, instead of
  // guessing one fixed offset per platform.
  const insets = useSafeAreaInsets();

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
            <ToastProvider topInset={insets.top}>
              <LanguageHydrator />
              <NotificationBridge />
              <PushPermissionBridge />
              <RatingPromptBridge />
              <RecurringPatternPromptBridge />
              <ThemedStatusBar />
              <OfflineBanner />
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
                  <Stack.Screen name="legal" />
                </Stack>
              </AuthHydrator>
            </ToastProvider>
          </ThemedApp>
        </ReduxProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
