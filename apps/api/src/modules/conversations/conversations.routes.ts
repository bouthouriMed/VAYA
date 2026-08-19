import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sendMessageSchema, listMessagesQuerySchema } from '@vaya/validation';
import { CONVERSATION_STATUSES } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import {
  getConversationByBookingId,
  listMessages,
  sendMessage,
} from './conversations.service.js';

const conversationResponseSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  status: z.enum(CONVERSATION_STATUSES),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const messageResponseSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderUserId: z.string().uuid(),
  body: z.string(),
  createdAt: z.date(),
});

const bookingIdParamSchema = z.object({ bookingId: z.string().uuid() });
const conversationIdParamSchema = z.object({ conversationId: z.string().uuid() });

export async function conversationsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  // GET /conversations/:bookingId — fetches the conversation for a
  // specific booking (not by conversation id), matching how mobile screens
  // navigate here: from a booking/trip screen that only knows bookingId.
  app.get(
    '/conversations/:bookingId',
    {
      onRequest: [fastify.authenticate],
      schema: { params: bookingIdParamSchema, response: { 200: conversationResponseSchema } },
    },
    async (request, reply) => {
      const conversation = await getConversationByBookingId(
        db,
        request.params.bookingId,
        getUserId(request),
      );
      reply.send(conversation);
    },
  );

  app.get(
    '/conversations/:conversationId/messages',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: conversationIdParamSchema,
        querystring: listMessagesQuerySchema,
        response: { 200: z.array(messageResponseSchema) },
      },
    },
    async (request, reply) => {
      const results = await listMessages(
        db,
        request.params.conversationId,
        getUserId(request),
        request.query.since,
      );
      reply.send(results);
    },
  );

  app.post(
    '/conversations/:conversationId/messages',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: conversationIdParamSchema,
        body: sendMessageSchema,
        response: { 200: messageResponseSchema },
      },
    },
    async (request, reply) => {
      const message = await sendMessage(
        db,
        request.params.conversationId,
        getUserId(request),
        request.body,
      );
      reply.send(message);
    },
  );
}
