import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParamSchema, registerPushTokenSchema, updateMeSchema } from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { getPublicProfile, getUserById, updateUser } from './users.service.js';
// Phase 7 (docs/roadmap/phase-07-notifications.md): device-token storage is
// notification-domain data (device_tokens table), so the write logic lives
// in the notifications module; this endpoint is exposed under /users/me per
// the phase doc's explicit API shape.
import { registerPushToken } from '../notifications/notifications.service.js';

const meResponseSchema = z.object({
  id: z.string().uuid(),
  phone: z.string(),
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

  app.get(
    '/users/:id',
    {
      onRequest: [fastify.authenticate],
      schema: { params: idParamSchema, response: { 200: publicProfileResponseSchema } },
    },
    async (request, reply) => {
      const profile = await getPublicProfile(db, request.params.id);
      reply.send(profile);
    },
  );
}
