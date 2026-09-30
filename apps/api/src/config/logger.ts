import pino from 'pino';
import { getEnv } from './env.js';

let _logger: pino.Logger | null = null;

// Query-string parameters that carry a credential or a one-time secret:
//   token         — the access JWT on the `/ws/trips/:id` WebSocket handshake
//                   (a browser/RN WebSocket can't set an Authorization header)
//   ticket/code/state — the Google OAuth callback's single-use login ticket,
//                   authorization code and signed state
//   access_token/refresh_token — defensive, in case a client ever sends one
// Fastify logs `req.url` verbatim for every request, so without this each of
// these ended up in plain text in whatever aggregator ingests stdout.
const SECRET_QUERY_PARAMS = new Set(['token', 'ticket', 'code', 'state', 'access_token', 'refresh_token']);

export function redactUrlSecrets(url: string | undefined): string | undefined {
  if (!url) return url;
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const path = url.slice(0, queryStart);
  const query = url.slice(queryStart + 1);
  const redacted = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = eq === -1 ? pair : pair.slice(0, eq);
      let decoded = name;
      try {
        decoded = decodeURIComponent(name);
      } catch {
        // keep the raw name — still compared below
      }
      return SECRET_QUERY_PARAMS.has(decoded.toLowerCase()) ? `${name}=[REDACTED]` : pair;
    })
    .join('&');
  return `${path}?${redacted}`;
}

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
      // Same shape as Fastify's own default `req` serializer (method/url/
      // host/remoteAddress), with secret query parameters masked.
      serializers: {
        req(request: { method?: string; url?: string; host?: string; hostname?: string; ip?: string }) {
          return {
            method: request.method,
            url: redactUrlSecrets(request.url),
            host: request.host ?? request.hostname,
            remoteAddress: request.ip,
          };
        },
      },
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
