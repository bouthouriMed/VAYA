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
import { getEnv, shouldExposeDevOtp } from '../../config/env.js';
import { RATE_LIMITS, keyedRateLimit } from '../../lib/rate-limit.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  function signAccessToken(userId: string): string {
    const env = getEnv();
    return app.jwt.sign({ sub: userId }, { expiresIn: env.JWT_ACCESS_TTL_SEC });
  }

  // Two independent counters per OTP route, both must pass:
  //  1. per client IP (`config.rateLimit`, evaluated in onRequest) — bounds
  //     how many *different* phone numbers one source can hit (SMS pumping /
  //     toll fraud: an attacker rotating target numbers used to face no limit
  //     at all, since the per-phone key below was the only one);
  //  2. per phone number (`preHandler` + keyedRateLimit) — bounds guessing
  //     and SMS-bombing against one number regardless of how many IPs the
  //     attacker rotates. This one MUST run in preHandler: `request.body` is
  //     not parsed yet in onRequest, so the previous `keyGenerator` reading
  //     `request.body.phone` there always saw `undefined` and silently fell
  //     back to the (attacker-chosen) client IP. See lib/rate-limit.ts.
  const otpRequestPhoneLimit = keyedRateLimit(fastify, {
    namespace: 'otp-request-phone',
    ...RATE_LIMITS.otpRequestPerPhone,
    key: (request) => (request.body as { phone?: string } | undefined)?.phone,
  });
  const otpVerifyPhoneLimit = keyedRateLimit(fastify, {
    namespace: 'otp-verify-phone',
    ...RATE_LIMITS.otpVerifyPerPhone,
    key: (request) => (request.body as { phone?: string } | undefined)?.phone,
  });

  // Slow-drip ceiling per source IP over an hour (the per-minute limiter
  // alone would still allow ~600 SMS/hour to distinct numbers).
  const otpRequestIpHourlyLimit = keyedRateLimit(fastify, {
    namespace: 'otp-request-ip-hourly',
    ...RATE_LIMITS.otpRequestPerIpHourly,
    key: () => undefined,
  });

  app.post(
    '/auth/otp/request',
    {
      config: { rateLimit: RATE_LIMITS.otpRequestPerIp },
      preHandler: [otpRequestIpHourlyLimit, otpRequestPhoneLimit],
      schema: {
        body: requestOtpSchema,
        response: { 200: z.object({ sent: z.boolean(), devCode: z.string().optional() }) },
      },
    },
    async (request, reply) => {
      const { code } = await requestOtp(db, request.body.phone);
      // Dev convenience only, and only on an explicit opt-in (EXPOSE_DEV_OTP)
      // in a development build with NO real SMS provider — see
      // shouldExposeDevOtp. Deriving this from NODE_ENV alone used to hand
      // every caller a valid login code for any phone number on any
      // deployment whose NODE_ENV was left at its `development` default.
      const devCode = shouldExposeDevOtp(getEnv()) ? code : undefined;
      reply.send({ sent: true, devCode });
    },
  );

  app.post(
    '/auth/otp/verify',
    {
      config: { rateLimit: RATE_LIMITS.otpVerifyPerIp },
      preHandler: [otpVerifyPhoneLimit],
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
      config: { rateLimit: RATE_LIMITS.oauthExchange },
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
      config: { rateLimit: RATE_LIMITS.tokenRefresh },
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
    {
      config: { rateLimit: RATE_LIMITS.tokenRefresh },
      schema: { body: refreshTokenSchema, response: { 200: z.object({ success: z.boolean() }) } },
    },
    async (request, reply) => {
      await revokeRefreshToken(db, request.body.refreshToken);
      reply.send({ success: true });
    },
  );
}
