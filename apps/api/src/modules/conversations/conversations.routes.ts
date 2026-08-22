import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sendMessageSchema, listMessagesQuerySchema } from '@vaya/validation';
import {
  CONVERSATION_STATUSES,
  RIDE_STATUSES,
  TRIP_STATUSES,
} from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import {
  getConversationByBookingId,
  listConversations,
  listMessages,
  sendMessage,
} from './conversations.service.js';

/**
 * The enriched conversation payload shared by both read endpoints — the
 * inbox row and the chat screen render from exactly this one shape (see
 * conversations.service.ts's ConversationSummary for what each field is
 * and why unread counts are deliberately absent).
 */
const conversationSummarySchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  status: z.enum(CONVERSATION_STATUSES),
  createdAt: z.date(),
  updatedAt: z.date(),
  viewerRole: z.enum(['driver', 'rider']),
  otherParty: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  otherPartyRole: z.enum(['driver', 'rider']),
  isOtherPartyVerified: z.boolean(),
  originLabel: z.string(),
  destinationLabel: z.string(),
  departureAt: z.date(),
  rideStatus: z.enum(RIDE_STATUSES),
  tripStatus: z.enum(TRIP_STATUSES).nullable(),
  lastMessage: z
    .object({
      body: z.string(),
      createdAt: z.date(),
      senderUserId: z.string().uuid(),
    })
    .nullable(),
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

  // GET /conversations — the inbox: every conversation whose booking the
  // requester is a party to, newest activity first.
  app.get(
    '/conversations',
    {
      onRequest: [fastify.authenticate],
      schema: { response: { 200: z.array(conversationSummarySchema) } },
    },
    async (request, reply) => {
      const summaries = await listConversations(db, getUserId(request));
      reply.send(summaries);
    },
  );

  // GET /conversations/:bookingId — fetches the (enriched) conversation for
  // a specific booking (not by conversation id), matching how mobile screens
  // navigate here: from a booking/trip screen that only knows bookingId.
  app.get(
    '/conversations/:bookingId',
    {
      onRequest: [fastify.authenticate],
      schema: { params: bookingIdParamSchema, response: { 200: conversationSummarySchema } },
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
