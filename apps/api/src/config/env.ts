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
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  _env = result.data;
  return _env;
}
