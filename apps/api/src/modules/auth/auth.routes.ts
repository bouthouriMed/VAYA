import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  authTokensSchema,
  refreshTokenSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import {
  requestOtp,
  verifyOtpAndIssueTokens,
  refreshAccessToken,
  revokeRefreshToken,
} from './auth.service.js';
import { getEnv } from '../../config/env.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  function signAccessToken(userId: string): string {
    const env = getEnv();
    return app.jwt.sign({ sub: userId }, { expiresIn: env.JWT_ACCESS_TTL_SEC });
  }

  app.post(
    '/auth/otp/request',
    { schema: { body: requestOtpSchema, response: { 200: z.object({ sent: z.boolean() }) } } },
    async (request, reply) => {
      await requestOtp(db, request.body.phone);
      reply.send({ sent: true });
    },
  );

  app.post(
    '/auth/otp/verify',
    { schema: { body: verifyOtpSchema, response: { 200: authTokensSchema } } },
    async (request, reply) => {
      const tokens = await verifyOtpAndIssueTokens(
        db,
        request.body.phone,
        request.body.code,
        signAccessToken,
      );
      reply.send(tokens);
    },
  );

  app.post(
    '/auth/refresh',
    {
      schema: {
        body: refreshTokenSchema,
        response: { 200: z.object({ accessToken: z.string(), expiresIn: z.number() }) },
      },
    },
    async (request, reply) => {
      const result = await refreshAccessToken(db, request.body.refreshToken, signAccessToken);
      reply.send(result);
    },
  );

  app.post(
    '/auth/logout',
    { schema: { body: refreshTokenSchema, response: { 200: z.object({ success: z.boolean() }) } } },
    async (request, reply) => {
      await revokeRefreshToken(db, request.body.refreshToken);
      reply.send({ success: true });
    },
  );
}
