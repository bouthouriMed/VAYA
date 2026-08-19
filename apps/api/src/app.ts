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
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { getEnv } from './config/env.js';
import { UnauthorizedError } from './lib/errors.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { geocodingRoutes } from './modules/geocoding/geocoding.routes.js';
import { corridorRoutes } from './modules/routes/routes.routes.js';
import { matchingRoutes } from './modules/matching/matching.routes.js';
import { bookingsRoutes } from './modules/bookings/bookings.routes.js';
import { ratingsRoutes } from './modules/ratings/ratings.routes.js';
import { driversRoutes } from './modules/drivers/drivers.routes.js';
import { uploadsRoutes } from './modules/uploads/uploads.routes.js';
import { ridesRoutes } from './modules/rides/rides.routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
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

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError('Invalid or missing access token');
    }
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  // Routes
  await app.register(healthRoutes, { prefix: env.API_PREFIX });
  await app.register(authRoutes, { prefix: env.API_PREFIX });
  await app.register(usersRoutes, { prefix: env.API_PREFIX });
  await app.register(geocodingRoutes, { prefix: env.API_PREFIX });
  await app.register(corridorRoutes, { prefix: env.API_PREFIX });
  await app.register(matchingRoutes, { prefix: env.API_PREFIX });
  await app.register(bookingsRoutes, { prefix: env.API_PREFIX });
  await app.register(ratingsRoutes, { prefix: env.API_PREFIX });
  await app.register(driversRoutes, { prefix: env.API_PREFIX });
  await app.register(uploadsRoutes, { prefix: env.API_PREFIX });
  await app.register(ridesRoutes, { prefix: env.API_PREFIX });

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
