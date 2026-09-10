import Constants from 'expo-constants';

const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1';

/**
 * Was duplicated verbatim across 3 files (state/api.ts, services/auth/
 * googleAuth.ts, features/tracking/useTripTracking.ts) — a real drift risk
 * flagged in the 2026-09-10 production-readiness audit: any one of them
 * changing without the others would silently point a subset of the app's
 * network calls at a different origin. One source of truth instead.
 */
export function getApiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra;
  return extra?.apiBaseUrl ?? DEFAULT_API_BASE_URL;
}
