import * as Sentry from '@sentry/node';
import { getEnv } from './env.js';

let _initialized = false;

/**
 * Error-tracking init — previously there was none at all: an unhandled
 * exception only ever reached a pino log line, invisible to anyone not
 * actively tailing production logs, with no aggregation, no alerting, and
 * no stack-trace grouping across occurrences. A no-op when SENTRY_DSN is
 * unset (dev/test default), so this is safe to call unconditionally at
 * process start — mirrors the rest of this codebase's "real provider when
 * configured, safe fallback otherwise" pattern (lib/sms, lib/email,
 * lib/storage).
 */
export function initMonitoring(): void {
  if (_initialized) return;
  const env = getEnv();
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0,
  });
  _initialized = true;
}

/** Safe to call whether or not monitoring is actually initialized (no-op otherwise). */
export function captureException(error: unknown): void {
  if (!_initialized) return;
  Sentry.captureException(error);
}
