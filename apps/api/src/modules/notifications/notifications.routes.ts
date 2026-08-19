import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { notificationIdParamSchema } from '@vaya/validation';
import { NOTIFICATION_EVENT_TYPES } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { listNotifications, markNotificationRead } from './notifications.service.js';

const notificationResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(NOTIFICATION_EVENT_TYPES),
  payload: z.unknown(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  app.get(
    '/notifications',
    {
      onRequest: [fastify.authenticate],
      schema: { response: { 200: z.array(notificationResponseSchema) } },
    },
    async (request, reply) => {
      const results = await listNotifications(db, getUserId(request));
      reply.send(results);
    },
  );

  app.patch(
    '/notifications/:notificationId/read',
    {
      onRequest: [fastify.authenticate],
      schema: { params: notificationIdParamSchema, response: { 200: notificationResponseSchema } },
    },
    async (request, reply) => {
      const notification = await markNotificationRead(
        db,
        request.params.notificationId,
        getUserId(request),
      );
      reply.send(notification);
    },
  );
}
