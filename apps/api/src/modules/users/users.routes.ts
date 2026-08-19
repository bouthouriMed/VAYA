import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParamSchema, updateMeSchema } from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { getPublicProfile, getUserById, updateUser } from './users.service.js';

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
        })
        .nullable(),
    })
    .nullable(),
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
