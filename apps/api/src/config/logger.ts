import pino from 'pino';
import { getEnv } from './env.js';

let _logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (!_logger) {
    const env = getEnv();
    _logger = pino({
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
      // This is also the instance Fastify itself logs every request/
      // response through (app.ts's `loggerInstance`), so this redaction
      // covers request logging too, not just explicit getLogger() calls —
      // an Authorization header or cookie logged verbatim on every request
      // would otherwise put every session token straight into whatever log
      // aggregator ingests stdout.
      // Deliberately does NOT include a blanket `*.code` — lib/sms/
      // dev-sms-provider.ts logs {phone, code} (the OTP) on purpose, the
      // only way to get it without real Twilio credentials in dev/test, and
      // production refuses to boot on DevSmsProvider at all (config/env.ts's
      // assertProductionSafe requires TWILIO_* to be set) — while a blanket
      // `*.code` would also silently redact AppError's harmless error `code`
      // field (e.g. 'VALIDATION_ERROR') on every single warn-level log.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.password',
          '*.passwordHash',
          '*.accessToken',
          '*.refreshToken',
        ],
        censor: '[REDACTED]',
      },
    });
  }
  return _logger;
}
