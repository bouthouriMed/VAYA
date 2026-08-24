// Converted from app.json to app.config.js so `extra.apiBaseUrl` can be
// populated from apps/mobile/.env at dev-server/build time (Expo's CLI
// auto-loads .env into process.env before this file is evaluated) — a
// physical device over LAN needs the host's LAN IP here, not localhost.
const withGoogleMapsIOS = require('./plugins/withGoogleMapsIOS');

module.exports = {
  expo: {
    name: 'VAYA',
    slug: 'vaya',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    scheme: 'vaya',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.vaya.app',
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
    },
    web: {
      bundler: 'metro',
    },
    plugins: [
      'expo-router',
      'expo-font',
      'expo-localization',
      'expo-secure-store',
      [
        'expo-notifications',
        {
          // No custom icon asset exists yet — Android falls back to a
          // silhouette generated from the app icon, which is functional
          // but not final. color is the accent an Android notification
          // icon/badge renders in, set to the brand sage token.
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
      apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
      eas: {
        // @bouthourimohamed/vaya — https://expo.dev/accounts/bouthourimohamed/projects/vaya
        projectId: '180c4be1-2a3c-438f-899a-68371c0635e4',
      },
    },
    owner: 'bouthourimohamed',
  },
};
