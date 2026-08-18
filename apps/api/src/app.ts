import path from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
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
