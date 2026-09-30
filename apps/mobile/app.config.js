// Converted from app.json to app.config.js so `extra.apiBaseUrl` can be
// populated from apps/mobile/.env at dev-server/build time (Expo's CLI
// auto-loads .env into process.env before this file is evaluated) — a
// physical device over LAN needs the host's LAN IP here, not localhost.
const withGoogleMapsIOS = require('./plugins/withGoogleMapsIOS');

// Derived once, at config-evaluation time, from the same env var the app
// itself resolves its API origin from (extra.apiBaseUrl below) — see the ATS
// comment on `infoPlist` for why this must never be an unconditional `true`.
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
const apiIsInsecureHttp = apiBaseUrl.startsWith('http://');

// Deliberately NOT named SENTRY_DSN: EAS Build's own container sets that
// exact name as an ambient env var for Expo's own internal CLI telemetry
// (visible in build logs as EAS_CLI_SENTRY_DSN, same value) — a real
// collision that was silently activating Sentry with Expo's own DSN on
// every build, which in turn wired up the Android Sentry Gradle upload
// task and broke production builds (sentry-cli failing to spawn, since
// nothing here has real Sentry credentials). A distinct name make "unset
// by default, safe no-op" (this file's actual intent) hold for real.
const sentryDsn = process.env.VAYA_SENTRY_DSN ?? null;

module.exports = {
  expo: {
    name: 'VAYA',
    slug: 'vaya',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    scheme: 'vaya',
    // A real, on-brand icon/splash (previously absent — every build shipped
    // Expo's generic default icon and splash screen). Deliberately simple:
    // a geometric "V" monogram in the app's actual, already-documented
    // brand tokens (packages/design-system/src/tokens/colors.ts's navy
    // `primary` #2E3B42 + sage `secondary` #7FA491) — not a fabricated
    // brand identity, a functional application of the one this codebase
    // already committed to everywhere else. Treat as a placeholder a real
    // designer should refine before launch, not a finished deliverable —
    // but a real branded icon beats Expo's default on every axis that
    // matters pre-launch (store listing thumbnail, home-screen icon,
    // app-switcher).
    icon: './assets/icon.png',
    // Splash config lives on the `expo-splash-screen` plugin below (this
    // SDK's current recommended mechanism), not the legacy top-level
    // `splash` key — the two would otherwise both try to own the same
    // native config.
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.vaya.app',
      // The API (apps/api/.env.example's default, and every LAN-IP dev
      // setup CLAUDE.md documents) serves over plain http, not https in dev
      // — no production HTTPS backend exists yet. Android has no equivalent
      // restriction in this setup, but iOS's App Transport Security blocks
      // any non-https request by default outside Expo Go's own permissive
      // Info.plist, which is exactly why a real iOS build/dev-client shows
      // real uploaded avatar photos as broken images (silently falling back
      // to initials via Avatar's onError) while the same photo loads fine
      // on Android. Requires a native prebuild/rebuild to take effect —
      // same category as this file's other native-config notes.
      //
      // Only applied when API_BASE_URL is actually http:// at build time —
      // an unconditional `NSAllowsArbitraryLoads: true` would disable HTTPS
      // enforcement app-wide (any embedded webview/browser content too, not
      // just the API) in every build including a real production one. Once
      // API_BASE_URL is set to a real https:// domain for a production EAS
      // build, this exception disappears automatically — nobody has to
      // remember to flip a flag.
      infoPlist: apiIsInsecureHttp
        ? {
            NSAppTransportSecurity: {
              NSAllowsArbitraryLoads: true,
            },
          }
        : {},
    },
    android: {
      package: 'com.vaya.app',
      // Gitignored locally (ask whoever set up the Firebase project,
      // console.firebase.google.com project vaya-f3eaa, for a copy). A
      // gitignored file never reaches EAS Build's cloud runner, so builds
      // there instead pull it from a GOOGLE_SERVICES_JSON EAS file-type
      // env var (see eas.json's per-profile "environment" field + EAS
      // dashboard/CLI env:set) — this is Expo's own documented pattern for
      // exactly this file. process.env.GOOGLE_SERVICES_JSON is a path EAS
      // Build injects at build time; the local path is the dev fallback.
      // Required for FCM-backed push notifications to work on an Android
      // build; the app still builds/runs fine without it, push token
      // registration just silently fails.
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      // Keep hardware/system back on the classic onBackPressed pipeline
      // instead of Android 13+'s predictive-back OnBackInvokedCallback.
      // With predictive back enabled, an edge-starting swipe can be
      // delivered as a raw back invocation that RN Modal windows don't
      // consume — a rightward swipe inside an open bottom sheet (e.g. the
      // calendar) then pops the whole app instead of just the sheet.
      // Requires a native dev-client rebuild to take effect.
      enableOnBackInvokedCallback: false,
      // react-native-maps' Google Maps SDK needs its own Android key,
      // separate from the iOS key below and from the server-side
      // GOOGLE_MAPS_SERVER_API_KEY in apps/api/.env.example — see
      // apps/mobile/.env.example for the restriction each one needs. Real
      // key required for the map to render on a real Android build/device;
      // without it, react-native-maps renders a blank gray tile area on
      // Android but the app doesn't crash.
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
        },
      },
      adaptiveIcon: {
        // Android composites this foreground (transparent bg, glyph kept
        // inside the ~66% safe zone) over backgroundColor itself, then
        // applies whichever mask shape the OEM launcher uses (circle,
        // squircle, rounded square) — unlike iOS/`icon` above, this can't
        // just reuse the same flat PNG.
        foregroundImage: './assets/adaptive-icon-foreground.png',
        backgroundColor: '#2E3B42',
      },
    },
    web: {
      bundler: 'metro',
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-font',
      'expo-localization',
      'expo-secure-store',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          resizeMode: 'contain',
          backgroundColor: '#2E3B42',
        },
      ],
      // Only wired in when a real DSN is configured — otherwise the plugin
      // still applies the Sentry Android Gradle plugin's upload task
      // (disableAutoUpload only skips the upload itself, not its
      // creation), which fails outright without real Sentry credentials.
      ...(sentryDsn
        ? [
            [
              '@sentry/react-native/expo',
              {
                // Native-SDK linking only — deliberately never attempts a
                // source-map upload during build (which needs a real Sentry
                // org/project/authToken this environment has none of, and
                // would otherwise risk failing the build on a network/auth
                // error over something that's supposed to be optional). Set
                // these up for real once a Sentry project exists — see
                // LAUNCH_ACTIONS.md.
                disableAutoUpload: true,
              },
            ],
          ]
        : []),
      [
        'expo-notifications',
        {
          // No dedicated small-icon asset (Android's notification-tray icon
          // must be a flat white silhouette, a distinct asset from the app
          // icon above) — Android derives one from adaptiveIcon's
          // foreground, functional but not final. color is the accent an
          // Android notification icon/badge renders in, set to the brand
          // sage token.
          color: '#7FA491',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'VAYA utilise votre position pour proposer un point de rendez-vous précis avec votre conducteur.',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission:
            "VAYA a besoin d'accéder à vos photos pour la photo du véhicule et les documents justificatifs.",
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission:
            'VAYA utilise la caméra pour vérifier votre permis, votre assurance et votre identité en direct.',
        },
      ],
      [withGoogleMapsIOS, { apiKey: process.env.GOOGLE_MAPS_IOS_API_KEY }],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      apiBaseUrl,
      // Real error tracking (src/services/monitoring/sentry.ts) — a real
      // DSN turns Sentry.init() on for real; unset by default (safe no-op),
      // matching the exact "real provider when configured, safe fallback
      // otherwise" pattern apps/api's lib/sms, lib/storage, and
      // config/monitoring.ts already established.
      sentryDsn,
      eas: {
        // @bouthourimohamed/vaya — https://expo.dev/accounts/bouthourimohamed/projects/vaya
        projectId: '180c4be1-2a3c-438f-899a-68371c0635e4',
      },
    },
    owner: 'bouthourimohamed',
  },
};
