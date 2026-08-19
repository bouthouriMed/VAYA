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
