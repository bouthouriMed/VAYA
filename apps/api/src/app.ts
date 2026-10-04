import path from 'node:path';
import { mkdirSync } from 'node:fs';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { eq } from 'drizzle-orm';
import { getEnv, resolveTrustProxy, shouldServeApiDocs } from './config/env.js';
import { getLogger } from './config/logger.js';
import { ForbiddenError, UnauthorizedError } from './lib/errors.js';
import { errorHandler } from './middleware/error-handler.js';
import { getDatabase } from './lib/database.js';
import { adminUsers, users } from './db/schema/index.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { metricsRoutes } from './modules/metrics/metrics.routes.js';
import { httpRequestDurationSeconds, httpRequestsTotal } from './lib/metrics.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { googleOAuthRoutes } from './modules/auth/google-auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { geocodingRoutes } from './modules/geocoding/geocoding.routes.js';
import { corridorRoutes } from './modules/routes/routes.routes.js';
import { matchingRoutes } from './modules/matching/matching.routes.js';
import { bookingsRoutes } from './modules/bookings/bookings.routes.js';
import { ratingsRoutes } from './modules/ratings/ratings.routes.js';
import { driversRoutes } from './modules/drivers/drivers.routes.js';
import { uploadsRoutes } from './modules/uploads/uploads.routes.js';
import { ridesRoutes } from './modules/rides/rides.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { conversationsRoutes } from './modules/conversations/conversations.routes.js';
import { tripsRoutes } from './modules/trips/trips.routes.js';
import { recurringRoutes } from './modules/recurring/recurring.routes.js';
import { adminAuthRoutes } from './modules/admin/admin-auth.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateSuperAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT {
    // `type: 'admin'` + `role` are only ever set on admin-issued tokens
    // (admin-auth.service.ts) — a consumer token's payload is just `{ sub }`,
    // unchanged. authenticateAdmin below is what actually enforces the
    // distinction; this shared payload type just has to cover both shapes.
    payload: { sub: string; type?: 'admin'; role?: string };
  }
}

export async function buildApp() {
  const env = getEnv();

  // A single shared logger (config/logger.ts), not a second inline
  // `{level: env.LOG_LEVEL}` config previously duplicated here — the two
  // instances diverged in practice (only config/logger.ts's had a dev-mode
  // pino-pretty transport; adding redaction to one silently wouldn't have
  // covered the other). Fastify decorates every request/response log line
  // through whichever instance it's given, so this one change covers both.
  // trustProxy used to be an unconditional `true`, i.e. "believe every hop
  // of X-Forwarded-For" — any client could then choose its own `request.ip`
  // and with it its rate-limit identity (every IP-keyed limiter in this app,
  // including the global 100/min default, was bypassable by rotating a
  // forged header). Now an explicit hop count: 1 in production behind the
  // Caddy container, none when the API is exposed directly. See
  // config/env.ts's resolveTrustProxy and docs/security/security-hardening.md.
  const app = Fastify({
    loggerInstance: getLogger(),
    trustProxy: resolveTrustProxy(env),
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Plugins
  // CORS_ORIGIN is a single '*' in dev (assertProductionSafe in config/env.ts
  // refuses to boot on that in production) or a real comma-separated origin
  // list in production (e.g. the admin app's domain) — @fastify/cors treats
  // a bare string as one literal origin, so a multi-origin value has to be
  // split into an array for it to actually allow more than one origin.
  const corsOrigin = env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((o) => o.trim());
  await app.register(cors, { origin: corsOrigin });
  await app.register(helmet);
  // Conservative global default; per-route overrides (e.g. OTP request,
  // which has an SMS-cost/spam-abuse surface) use the `config.rateLimit`
  // route option — see auth.routes.ts.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
  await app.register(jwt, { secret: env.JWT_SECRET });
  // Explicit ceilings on every multipart request (busboy's defaults are
  // unbounded parts/fields): one file, a handful of text fields, 8MB — the
  // same per-file cap uploads.routes.ts applies on top.
  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5, parts: 6, headerPairs: 50 },
  });
  await app.register(websocket);
  // @fastify/static warns (harmlessly, but on every boot) if `root` doesn't
  // exist yet — true on a fresh checkout/container before any upload has
  // ever happened, since LocalDiskStorageAdapter only creates it lazily on
  // first write. Harmless to create unconditionally even when S3StorageAdapter
  // is active (lib/storage/index.ts) — this mount is then simply never
  // written to.
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  mkdirSync(uploadsRoot, { recursive: true });
  // Public uploads (avatars, vehicle photos) are stored under a random
  // UUID filename and never rewritten — a changed photo is a new URL — so
  // devices may keep them for a year instead of re-downloading the same
  // image on every screen that shows it.
  await app.register(staticPlugin, {
    root: uploadsRoot,
    prefix: '/uploads/',
    maxAge: '365d',
    immutable: true,
  });

  // The complete endpoint/schema map (Swagger UI + openapi.json) is only
  // served outside production unless ENABLE_API_DOCS=true — see
  // shouldServeApiDocs. The swagger plugin itself stays registered either
  // way: `jsonSchemaTransform` and `app.swagger()` are also what
  // packages/api-client's generator reads in CI/dev.
  const serveDocs = shouldServeApiDocs(env);
  await app.register(swagger, {
    openapi: {
      info: { title: 'VAYA API', version: '0.1.0' },
      servers: [{ url: env.API_PREFIX }],
    },
    transform: jsonSchemaTransform,
  });
  if (serveDocs) {
    await app.register(swaggerUi, { routePrefix: `${env.API_PREFIX}/docs` });
  }

  const db = getDatabase();

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError('Invalid or missing access token');
    }
    if (request.user.type === 'admin') {
      throw new UnauthorizedError('Admin tokens cannot access consumer endpoints');
    }
    // Every consumer access token's `sub` is a user UUID. The same secret
    // also signs the short-lived Google OAuth `state` JWT (sub =
    // "google_oauth_state:<uri>", handed to anyone who calls
    // /auth/google/start) — without this check that token verified as a
    // bearer credential and reached the users lookup below with a non-UUID,
    // turning into a 500 (and Sentry noise) instead of a clean 401.
    if (!UUID_PATTERN.test(request.user.sub)) {
      throw new UnauthorizedError('Invalid or missing access token');
    }
    // Suspension (docs/domain/admin-platform.md) is enforced here, not only
    // surfaced in the admin UI — a suspended user's existing token must stop
    // working on the very next authenticated request, matching CLAUDE.md's
    // "backend enforces independent of client" rule.
    const user = await db.query.users.findFirst({ where: eq(users.id, request.user.sub) });
    // A validly-signed token for a user row that no longer exists is not a
    // session — previously it fell through with `user` undefined and every
    // check below silently skipped.
    if (!user) {
      throw new UnauthorizedError('Invalid or missing access token');
    }
    if (user.suspendedAt) {
      throw new ForbiddenError('This account has been suspended');
    }
    // Deletion (docs/legal/privacy-policy.md §10) revokes every refresh
    // token at the time of deletion, but a still-live access token has its
    // own short TTL independent of that — this stops it working on the
    // very next request too, same discipline as the suspension check above.
    if (user.deletedAt) {
      throw new ForbiddenError('This account has been deleted');
    }
  });

  // Admin tokens live 4h and carry a `role` claim, but a JWT alone cannot be
  // revoked or demoted: a removed or downgraded admin's token would keep
  // working (at its old privilege) until it expired. So the admin row is
  // re-read on every request and the DATABASE role — not the token's claim —
  // decides what the caller may do. One indexed primary-key lookup.
  async function loadCurrentAdmin(request: FastifyRequest): Promise<{ id: string; role: 'admin' | 'superadmin' }> {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError('Invalid or missing access token');
    }
    if (request.user.type !== 'admin' || !UUID_PATTERN.test(request.user.sub)) {
      throw new ForbiddenError('Admin access required');
    }
    const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, request.user.sub) });
    if (!admin) {
      throw new UnauthorizedError('Invalid or missing access token');
    }
    return { id: admin.id, role: admin.role };
  }

  app.decorate('authenticateAdmin', async (request: FastifyRequest, _reply: FastifyReply) => {
    await loadCurrentAdmin(request);
  });

  // The `admin`/`superadmin` role distinction admin-auth.routes.ts already
  // issues in every admin token's payload was previously never checked
  // anywhere — every route behind authenticateAdmin was reachable by any
  // admin account regardless of role. Routes with platform-wide blast radius
  // (account suspension, platform pricing/matching/cancellation config) now
  // require this stricter check; day-to-day moderation (KYC review, ride
  // cancellation, report handling) stays on authenticateAdmin.
  app.decorate('authenticateSuperAdmin', async (request: FastifyRequest, _reply: FastifyReply) => {
    const admin = await loadCurrentAdmin(request);
    if (admin.role !== 'superadmin') {
      throw new ForbiddenError('Superadmin access required');
    }
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  // API responses are personal and/or live (bookings, seats, messages,
  // KYC files): never let a device or proxy HTTP cache keep or replay them.
  // The mobile app's own cache (RTK Query) decides what to reuse and when to
  // refetch. Routes that set their own Cache-Control (e.g. the /uploads/
  // static files above) keep it.
  app.addHook('onSend', async (_request, reply, payload) => {
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });

  // Records every response into the two /metrics series (lib/metrics.ts).
  // Labeled by `routeOptions.url` (the parameterized pattern, e.g.
  // `/users/:id`), never the raw request path — a raw-path label would
  // create one time series per unique id ever requested, an unbounded-
  // cardinality footgun Prometheus itself warns against.
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';
    const labels = { method: request.method, route, status_code: String(reply.statusCode) };
    httpRequestDurationSeconds.observe(labels, reply.elapsedTime / 1000);
    httpRequestsTotal.inc(labels);
  });

  // Routes
  await app.register(healthRoutes, { prefix: env.API_PREFIX });
  // Unprefixed — Prometheus scrape configs universally expect a bare
  // `/metrics`, not this app's own `/api/v1` convention.
  await app.register(metricsRoutes);
  await app.register(authRoutes, { prefix: env.API_PREFIX });
  // Unprefixed: Google redirects the browser to GOOGLE_CALLBACK_URL exactly
  // as registered in GCP, which this app doesn't get to reshape.
  await app.register(googleOAuthRoutes);
  await app.register(usersRoutes, { prefix: env.API_PREFIX });
  await app.register(geocodingRoutes, { prefix: env.API_PREFIX });
  await app.register(corridorRoutes, { prefix: env.API_PREFIX });
  await app.register(matchingRoutes, { prefix: env.API_PREFIX });
  await app.register(bookingsRoutes, { prefix: env.API_PREFIX });
  await app.register(ratingsRoutes, { prefix: env.API_PREFIX });
  await app.register(driversRoutes, { prefix: env.API_PREFIX });
  await app.register(uploadsRoutes, { prefix: env.API_PREFIX });
  await app.register(ridesRoutes, { prefix: env.API_PREFIX });
  await app.register(notificationsRoutes, { prefix: env.API_PREFIX });
  await app.register(conversationsRoutes, { prefix: env.API_PREFIX });
  await app.register(tripsRoutes, { prefix: env.API_PREFIX });
  await app.register(recurringRoutes, { prefix: env.API_PREFIX });
  await app.register(analyticsRoutes, { prefix: env.API_PREFIX });
  await app.register(reportsRoutes, { prefix: env.API_PREFIX });
  await app.register(adminAuthRoutes, { prefix: `${env.API_PREFIX}/admin` });
  await app.register(adminRoutes, { prefix: `${env.API_PREFIX}/admin` });

  if (serveDocs) {
    app.get(`${env.API_PREFIX}/openapi.json`, async () => app.swagger());
  }

  // Catch-all 404
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });

  return app;
}
