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
  consumeOauthTicket,
  issueTokens,
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
    {
      // Tighter than the global default: this endpoint sends an SMS per
      // call, so it's both a cost and an abuse (OTP-spam) surface. Keyed by
      // phone (not the default req.ip) so the limit can't be reset by
      // rotating a spoofable X-Forwarded-For value — see app.ts's
      // `trustProxy: true` comment for why IP alone isn't a safe key here.
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: (request) => (request.body as { phone?: string })?.phone ?? request.ip,
        },
      },
      schema: {
        body: requestOtpSchema,
        response: { 200: z.object({ sent: z.boolean(), devCode: z.string().optional() }) },
      },
    },
    async (request, reply) => {
      const { code } = await requestOtp(db, request.body.phone);
      // Dev convenience only: no SMS provider is wired up, so surface the
      // code in the response instead of requiring a server-log tail. Never
      // present outside development.
      const devCode = getEnv().NODE_ENV === 'development' ? code : undefined;
      reply.send({ sent: true, devCode });
    },
  );

  app.post(
    '/auth/otp/verify',
    {
      // No per-route limit existed here before — verify is a 6-digit
      // brute-force surface (1,000,000 combinations, 5-minute TTL) and the
      // global 100/min default is both too loose and IP-keyed (spoofable,
      // see above). Keyed by phone so an attacker can't reset the budget by
      // rotating IP either.
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (request) => (request.body as { phone?: string })?.phone ?? request.ip,
        },
      },
      schema: { body: verifyOtpSchema, response: { 200: authTokensSchema } },
    },
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
    '/auth/google/exchange',
    {
      schema: {
        body: z.object({ ticket: z.string().min(1) }),
        response: { 200: authTokensSchema },
      },
    },
    async (request, reply) => {
      const userId = await consumeOauthTicket(db, request.body.ticket);
      const tokens = await issueTokens(db, userId, signAccessToken);
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
