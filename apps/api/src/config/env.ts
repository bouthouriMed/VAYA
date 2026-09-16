import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  API_PREFIX: z.string().default('/api/v1'),
  JWT_SECRET: z.string().default('dev-insecure-jwt-secret-change-in-production'),
  JWT_ACCESS_TTL_SEC: z.coerce.number().default(900),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  OSRM_URL: z.string().url().default('http://localhost:5001'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  // The LOCAL port the OAuth callback listener binds to — independent of
  // whatever port (if any) appears in GOOGLE_CALLBACK_URL itself. They match
  // for a bare host:port callback URL, but diverge once GOOGLE_CALLBACK_URL
  // is a tunnel domain (e.g. https://*.trycloudflare.com, implicit port
  // 443) whose *local* target the tunnel process points at this port.
  GOOGLE_OAUTH_CALLBACK_PORT: z.coerce.number().default(4000),
  // Location/routing (distinct from the GOOGLE_CLIENT_ID/SECRET pair above,
  // which is Sign-in-with-Google OAuth — an unrelated Google product).
  GOOGLE_MAPS_SERVER_API_KEY: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  GOOGLE_ROUTES_API_KEY: z.string().optional(),
  GOOGLE_GEOCODING_API_KEY: z.string().optional(),
  LOCATION_PROVIDER: z.enum(['auto', 'google', 'nominatim']).default('auto'),
  ROUTING_PROVIDER: z.enum(['auto', 'google', 'osrm']).default('auto'),
  // VAYA is Tunisia-only for now, so location search stays scoped there by
  // default — set to 'false' to search/autocomplete anywhere in the world
  // (Tortosa, Barcelona, Paris, Switzerland, Algeria, Dakar, ...), e.g. for
  // demoing or testing outside Tunisia.
  LOCATION_RESTRICT_TO_TUNISIA: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  POSTGIS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  // Transactional email (docs/domain/notifications.md's email-dispatch
  // extension of Phase 7): a direct HTTP call to Resend's API — same
  // "dependency-free, direct fetch to the provider's HTTP API" pattern
  // Phase 7 already established for Expo push (expo-push.ts), not an SDK.
  // Unset in dev/test by default: getEmailProvider() (lib/email/index.ts)
  // falls back to a DevEmailProvider that logs instead of sending, mirroring
  // lib/sms's DevSmsProvider fallback.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('VAYA <no-reply@vaya-app.com>'),
  // SMS/OTP delivery (lib/sms) — same direct-HTTP-call pattern as Resend
  // above. All three required together to activate TwilioSmsProvider;
  // unset in dev/test by default, falling back to DevSmsProvider (logs the
  // OTP instead of sending it). Phone/OTP is this app's *default* auth path,
  // with Google OAuth as the other independent one — assertProductionSafe
  // below refuses to boot only when *neither* path is configured (silently
  // logging every OTP with no working alternative sign-in is not a safe
  // default to ever reach production); Twilio alone missing with a real
  // Google client configured is a deliberate degrade, not a boot-blocker.
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  // File storage (lib/storage) — KYC documents (license/insurance/selfie)
  // and avatar/vehicle photos. All of S3_BUCKET/S3_REGION/S3_ACCESS_KEY_ID/
  // S3_SECRET_ACCESS_KEY required together to activate S3StorageAdapter;
  // unset in dev/test by default, falling back to LocalDiskStorageAdapter
  // (writes to the container's local filesystem — fine for a single dev
  // machine, but permanently loses every KYC document on any redeploy of an
  // ephemeral production container). S3_ENDPOINT/S3_FORCE_PATH_STYLE are
  // optional overrides for an S3-compatible provider other than AWS (e.g.
  // Cloudflare R2, MinIO). S3_PUBLIC_URL_BASE overrides the public URL
  // constructed for `save()` results (e.g. a CDN domain in front of the
  // bucket) — defaults to the bucket's own virtual-hosted-style URL.
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  S3_PUBLIC_URL_BASE: z.string().url().optional(),
  // Error tracking (config/monitoring.ts) — a real Sentry DSN turns on
  // Sentry.init for real; unset in dev/test by default (safe no-op).
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const INSECURE_JWT_SECRET_DEFAULT = 'dev-insecure-jwt-secret-change-in-production';

// Values that are safe (even necessary) in development/test but must never
// reach a real production deploy. Zod's per-field `.default()` can't express
// "required unless NODE_ENV !== production" on its own, so this cross-field
// check runs after the base schema — catching exactly the case CLAUDE.md's
// own "no secrets in git" rule exists to prevent: a production boot silently
// succeeding on a publicly-known-from-source-code secret or a wide-open CORS
// default because the real env var was simply never set.
export function assertProductionSafe(env: Env): void {
  if (env.NODE_ENV !== 'production') return;

  const errors: string[] = [];
  if (env.JWT_SECRET === INSECURE_JWT_SECRET_DEFAULT || env.JWT_SECRET.length < 32) {
    errors.push(
      'JWT_SECRET must be set to a real secret (32+ chars) in production — refusing to boot on the insecure default.'
    );
  }
  if (env.CORS_ORIGIN === '*') {
    errors.push(
      'CORS_ORIGIN must not be "*" in production — set it to the real allowed origin(s) (admin app domain, etc).'
    );
  }
  // Phone/OTP and Google are the app's two independent sign-in paths
  // (schema.ts: users.phone is nullable specifically so a Google-only
  // account can exist with no phone at all). Refusing to boot is only
  // correct when NEITHER path actually works — that's the one state where
  // literally no user could ever sign in. Twilio alone missing, with a
  // real Google OAuth client configured, is a real, deliberate product
  // choice (e.g. launching before a viable Tunisia SMS provider is lined
  // up), not a misconfiguration — downgraded to a warning below instead.
  const hasTwilio = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
  const hasGoogleOAuth = Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL
  );
  if (!hasTwilio && !hasGoogleOAuth) {
    errors.push(
      'Neither Twilio (phone/OTP) nor Google OAuth is configured — refusing to boot with no working sign-in path at all. Set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER, or GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_CALLBACK_URL, or both.'
    );
  }
  const hasS3 = Boolean(
    env.S3_BUCKET && env.S3_REGION && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
  );
  if (!hasS3) {
    errors.push(
      'S3_BUCKET/S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY must all be set in production — refusing to boot on LocalDiskStorageAdapter, which loses every KYC document/photo on container restart.'
    );
  }
  if (errors.length > 0) {
    console.error('Refusing to start in production with unsafe configuration:', errors);
    process.exit(1);
  }

  // Non-fatal: these degrade to a dev-only fallback rather than breaking the
  // core auth/document flows above, but silently doing so in production
  // (nothing sent, nothing logged beyond a per-call warning) is still a real
  // operational surprise worth a loud one-time boot warning.
  const warnings: string[] = [];
  if (!hasTwilio && hasGoogleOAuth) {
    warnings.push(
      'Twilio is unset — phone/OTP sign-in will not work (OTP codes are only logged, never sent). Google is the only working sign-in path until this is configured.'
    );
  }
  if (!env.RESEND_API_KEY) {
    warnings.push('RESEND_API_KEY is unset — transactional emails will only be logged, never sent.');
  }
  if (!env.REDIS_URL) {
    warnings.push(
      'REDIS_URL is unset — caching, rate-limit backing, and the BullMQ notification/recurring-scan queues are all disabled.'
    );
  }
  if (!env.SENTRY_DSN) {
    warnings.push('SENTRY_DSN is unset — unhandled exceptions are only logged, never reported anywhere.');
  }
  if (warnings.length > 0) {
    console.warn('Starting in production with degraded configuration:', warnings);
  }
}

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env);
    assertProductionSafe(_env);
  }
  return _env;
}

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  assertProductionSafe(result.data);
  _env = result.data;
  return _env;
}
