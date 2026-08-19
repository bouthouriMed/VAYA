import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.schema';
import { users } from './users.schema';

/**
 * Text-only, v1 (docs/roadmap/phase-08-messaging.md — "no attachments in
 * v1"). `body` length is capped at the schema level (not just Zod) so the
 * content-safety bound holds even against a direct DB write. Indexed on
 * (conversationId, createdAt) — the exact shape the polling endpoint
 * (`GET /conversations/:id/messages?since=`) queries by.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id),
    body: varchar('body', { length: 1000 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdCreatedAtIdx: index('messages_conversation_id_created_at_idx').on(
      table.conversationId,
      table.createdAt,
    ),
  }),
);
