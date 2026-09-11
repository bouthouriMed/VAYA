import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

let initialized = false;

function getSentryDsn(): string | null {
  const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra;
  return (extra?.sentryDsn as string | null | undefined) ?? null;
}

/**
 * Previously this app had zero production error visibility — an unhandled
 * exception was, at best, a `console.error` inside `ErrorBoundary`
 * (src/components/ErrorBoundary.tsx), which goes nowhere durable once a
 * real device is out of a debugger's reach. A no-op when no DSN is
 * configured (dev/test default, and any build before a real Sentry project
 * exists — see LAUNCH_ACTIONS.md), mirroring apps/api's own
 * config/monitoring.ts "real provider when configured, safe fallback
 * otherwise" pattern. Call once, at app root, before anything else renders.
 */
export function initMonitoring(): void {
  if (initialized) return;
  const dsn = getSentryDsn();
  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    // This app has no on-device or EAS-build verification path in this
    // sandboxed environment (see PRODUCTION_READINESS.md) — sessions/replay
    // are exactly the kind of feature that needs a real device to confirm
    // isn't silently misbehaving, so left off rather than enabled blind.
  });
  initialized = true;
}

/** Safe to call whether or not monitoring is actually initialized (no-op otherwise). */
export function captureException(error: unknown): void {
  if (!initialized) return;
  Sentry.captureException(error);
}
