import { describe, it, expect, vi, afterEach } from 'vitest';
import { assertProductionSafe, type Env } from '../env.js';

/** A minimal, otherwise-safe production Env — each test overrides only the
 * field(s) under test, so a passing case never depends on unrelated fields
 * happening to be valid. */
function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'production',
    PORT: 3000,
    HOST: '0.0.0.0',
    DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    REDIS_URL: undefined,
    LOG_LEVEL: 'info',
    CORS_ORIGIN: 'https://example.com',
    API_PREFIX: '/api/v1',
    JWT_SECRET: 'a'.repeat(48),
    JWT_ACCESS_TTL_SEC: 900,
    JWT_REFRESH_TTL_DAYS: 30,
    OSRM_URL: 'http://localhost:5001',
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    GOOGLE_CALLBACK_URL: undefined,
    GOOGLE_OAUTH_CALLBACK_PORT: 4000,
    GOOGLE_MAPS_SERVER_API_KEY: undefined,
    GOOGLE_PLACES_API_KEY: undefined,
    GOOGLE_ROUTES_API_KEY: undefined,
    GOOGLE_GEOCODING_API_KEY: undefined,
    LOCATION_PROVIDER: 'auto',
    ROUTING_PROVIDER: 'auto',
    LOCATION_RESTRICT_TO_TUNISIA: true,
    POSTGIS_ENABLED: true,
    RESEND_API_KEY: 're_real_key',
    EMAIL_FROM: 'VAYA <no-reply@vaya-app.com>',
    TWILIO_ACCOUNT_SID: 'ACreal',
    TWILIO_AUTH_TOKEN: 'real-token',
    TWILIO_FROM_NUMBER: '+15551234567',
    S3_BUCKET: 'vaya-bucket',
    S3_REGION: 'auto',
    S3_ACCESS_KEY_ID: 'real-key-id',
    S3_SECRET_ACCESS_KEY: 'real-secret',
    S3_ENDPOINT: undefined,
    S3_FORCE_PATH_STYLE: false,
    S3_PUBLIC_URL_BASE: undefined,
    SENTRY_DSN: 're_sentry_dsn',
    ...overrides,
  };
}

describe('assertProductionSafe — sign-in path requirement', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  function spyOnExit(): void {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    }) as unknown as ReturnType<typeof vi.spyOn>;
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('boots cleanly with both Twilio and Google configured', () => {
    spyOnExit();
    const env = baseEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_CALLBACK_URL: 'https://api.example.com/auth/google/callback',
    });
    expect(() => assertProductionSafe(env)).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('boots cleanly with only Twilio configured (no Google)', () => {
    spyOnExit();
    const env = baseEnv();
    expect(() => assertProductionSafe(env)).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('boots with only Google configured, Twilio unset — degrades with a warning, does not refuse to boot', () => {
    spyOnExit();
    const env = baseEnv({
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_FROM_NUMBER: undefined,
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_CALLBACK_URL: 'https://api.example.com/auth/google/callback',
    });
    expect(() => assertProductionSafe(env)).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Starting in production with degraded configuration:',
      expect.arrayContaining([expect.stringContaining('Google is the only working sign-in path')])
    );
  });

  it('refuses to boot when neither Twilio nor Google is configured', () => {
    spyOnExit();
    const env = baseEnv({
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_FROM_NUMBER: undefined,
    });
    expect(() => assertProductionSafe(env)).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Refusing to start in production with unsafe configuration:',
      expect.arrayContaining([expect.stringContaining('no working sign-in path at all')])
    );
  });

  it('is a no-op outside production regardless of sign-in config', () => {
    spyOnExit();
    const env = baseEnv({
      NODE_ENV: 'development',
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_FROM_NUMBER: undefined,
    });
    expect(() => assertProductionSafe(env)).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
