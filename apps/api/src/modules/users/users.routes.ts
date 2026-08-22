import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idParamSchema,
  registerPushTokenSchema,
  requestOtpSchema,
  updateMeSchema,
  verifyOtpSchema,
} from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { getPublicProfile, getUserById, updateUser, attachPhoneToUser } from './users.service.js';
import { requestOtp } from '../auth/auth.service.js';
import { getEnv } from '../../config/env.js';
// Phase 7 (docs/roadmap/phase-07-notifications.md): device-token storage is
// notification-domain data (device_tokens table), so the write logic lives
// in the notifications module; this endpoint is exposed under /users/me per
// the phase doc's explicit API shape.
import { registerPushToken } from '../notifications/notifications.service.js';

const meResponseSchema = z.object({
  id: z.string().uuid(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  authProvider: z.enum(['phone', 'google']),
  fullName: z.string(),
  avatarUrl: z.string().nullable(),
  locale: z.enum(['fr', 'ar', 'en']),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const publicProfileResponseSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  avatarUrl: z.string().nullable(),
  driver: z
    .object({
      bio: z.string().nullable(),
      languages: z.array(z.string()).nullable(),
      ratingAvg: z.number(),
      tripCount: z.number(),
      punctualityScore: z.number(),
      reliabilityScore: z.number(),
      vehicle: z
        .object({
          make: z.string(),
          model: z.string(),
          color: z.string(),
          photoUrl: z.string().nullable(),
          plateNumber: z.string(),
        })
        .nullable(),
    })
    .nullable(),
});

const pushTokenResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  token: z.string(),
  platform: z.enum(['ios', 'android']),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  app.get(
    '/users/me',
    { onRequest: [fastify.authenticate], schema: { response: { 200: meResponseSchema } } },
    async (request, reply) => {
      const user = await getUserById(db, getUserId(request));
      reply.send(user);
    },
  );

  app.patch(
    '/users/me',
    {
      onRequest: [fastify.authenticate],
      schema: { body: updateMeSchema, response: { 200: meResponseSchema } },
    },
    async (request, reply) => {
      const user = await updateUser(db, getUserId(request), request.body);
      reply.send(user);
    },
  );

  app.post(
    '/users/me/phone/request-otp',
    {
      onRequest: [fastify.authenticate],
      // Same cost/abuse posture as /auth/otp/request (sends a real SMS).
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        body: requestOtpSchema,
        response: { 200: z.object({ sent: z.boolean(), devCode: z.string().optional() }) },
      },
    },
    async (request, reply) => {
      const { code } = await requestOtp(db, request.body.phone);
      const devCode = getEnv().NODE_ENV === 'development' ? code : undefined;
      reply.send({ sent: true, devCode });
    },
  );

  app.post(
    '/users/me/phone/verify',
    {
      onRequest: [fastify.authenticate],
      schema: { body: verifyOtpSchema, response: { 200: meResponseSchema } },
    },
    async (request, reply) => {
      const user = await attachPhoneToUser(
        db,
        getUserId(request),
        request.body.phone,
        request.body.code,
      );
      reply.send(user);
    },
  );

  app.post(
    '/users/me/push-token',
    {
      onRequest: [fastify.authenticate],
      schema: { body: registerPushTokenSchema, response: { 200: pushTokenResponseSchema } },
    },
    async (request, reply) => {
      const deviceToken = await registerPushToken(db, getUserId(request), request.body);
      reply.send(deviceToken);
    },
  );

  // Public — a browsing (not yet signed-in) rider needs to see the driver's
  // trust card before Demander une place. getPublicProfile already never
  // exposes phone/contacts, per its own doc comment.
  app.get(
    '/users/:id',
    {
      schema: { params: idParamSchema, response: { 200: publicProfileResponseSchema } },
    },
    async (request, reply) => {
      const profile = await getPublicProfile(db, request.params.id);
      reply.send(profile);
    },
  );
}
