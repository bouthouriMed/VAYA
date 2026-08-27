import path from 'node:path';
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
import { getEnv } from './config/env.js';
import { ForbiddenError, UnauthorizedError } from './lib/errors.js';
import { errorHandler } from './middleware/error-handler.js';
import { getDatabase } from './lib/database.js';
import { users } from './db/schema/index.js';
import { healthRoutes } from './modules/health/health.routes.js';
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

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
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

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    trustProxy: true,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Plugins
  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(helmet);
  // Conservative global default; per-route overrides (e.g. OTP request,
  // which has an SMS-cost/spam-abuse surface) use the `config.rateLimit`
  // route option — see auth.routes.ts.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(multipart);
  await app.register(websocket);
  await app.register(staticPlugin, {
    root: path.resolve(process.cwd(), 'uploads'),
    prefix: '/uploads/',
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'VAYA API', version: '0.1.0' },
      servers: [{ url: env.API_PREFIX }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: `${env.API_PREFIX}/docs` });

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
    // Suspension (docs/domain/admin-platform.md) is enforced here, not only
    // surfaced in the admin UI — a suspended user's existing token must stop
    // working on the very next authenticated request, matching CLAUDE.md's
    // "backend enforces independent of client" rule.
    const user = await db.query.users.findFirst({ where: eq(users.id, request.user.sub) });
    if (user?.suspendedAt) {
      throw new ForbiddenError('This account has been suspended');
    }
  });

  app.decorate('authenticateAdmin', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError('Invalid or missing access token');
    }
    if (request.user.type !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  // Routes
  await app.register(healthRoutes, { prefix: env.API_PREFIX });
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

  app.get(`${env.API_PREFIX}/openapi.json`, async () => app.swagger());

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
