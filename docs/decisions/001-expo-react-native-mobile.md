# ADR-001: Expo + React Native for Native Mobile

## Status

Accepted

## Context

VAYA needs a native mobile application for Android and iOS that provides a carpooling marketplace experience in Tunisia.

### Options Considered

1. **Next.js (React Native Web)**
2. **Expo + React Native + Expo Router**

### Why NOT Next.js

Next.js is a web framework optimized for server-side rendering and static site generation. While React Native Web can share some code, the following issues make it unsuitable:

- **No true native modules**: Next.js cannot access native device APIs (camera, GPS, biometrics, notifications) without complex workarounds
- **Poor offline support**: Native mobile apps require robust offline capabilities; web apps have limited service worker support
- **Performance**: React Native provides a native UI thread; web rendering is fundamentally slower for mobile interactions
- **App Store distribution**: A carpooling app needs App Store/Play Store presence; web-first apps have poor discoverability
- **Native gestures and animations**: React Native's gesture system and Reanimated provide 60fps animations; CSS animations cannot match this
- **Platform-specific UI**: iOS and Android have different design conventions; React Native handles this natively
- **Background processing**: Native apps can handle background location tracking, push notifications, and background tasks; web apps cannot

### Why Expo + React Native

- **Managed workflow**: Expo handles build, signing, and deployment complexity
- **Expo Router**: File-based routing similar to Next.js but for native mobile
- **OTA updates**: Expo Updates allows pushing OTA updates without app store review
- **Native module ecosystem**: Access to camera, location, notifications, biometrics via Expo SDK
- **TypeScript support**: First-class TypeScript support throughout the stack
- **New Architecture**: Hermes engine and Fabric renderer for optimal performance
- **EAS Build**: Cloud-based builds for iOS and Android without local Xcode/Android Studio setup
- **Proven at scale**: Used by major apps like Instagram, Bloomberg, and Shopify

## Decision

Use Expo + React Native + Expo Router for the mobile application.

## Consequences

- Native performance on both iOS and Android
- Access to all device APIs
- File-based routing with Expo Router
- Shared design system via React Native components
- Separate API contract via OpenAPI for type safety
- No web code sharing with Next.js (intentional trade-off)
- Mobile-first, not web-first
