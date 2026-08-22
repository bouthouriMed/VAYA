// Converted from app.json to app.config.js so `extra.apiBaseUrl` can be
// populated from apps/mobile/.env at dev-server/build time (Expo's CLI
// auto-loads .env into process.env before this file is evaluated) — a
// physical device over LAN needs the host's LAN IP here, not localhost.
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
      // Keep hardware/system back on the classic onBackPressed pipeline
      // instead of Android 13+'s predictive-back OnBackInvokedCallback.
      // With predictive back enabled, an edge-starting swipe can be
      // delivered as a raw back invocation that RN Modal windows don't
      // consume — a rightward swipe inside an open bottom sheet (e.g. the
      // calendar) then pops the whole app instead of just the sheet.
      // Requires a native dev-client rebuild to take effect.
      enableOnBackInvokedCallback: false,
      // react-native-maps needs its own Google Maps API key on Android
      // (iOS uses Apple Maps by default, no key needed). Real key required
      // for the map to render on a real Android build/device — set
      // GOOGLE_MAPS_API_KEY in apps/mobile/.env, never commit the value
      // itself. Without it, react-native-maps renders a blank gray tile
      // area on Android but the app doesn't crash.
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
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
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    },
  },
};
