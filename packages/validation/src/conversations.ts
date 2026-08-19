import { z } from 'zod';

// Content safety (docs/roadmap/phase-08-messaging.md's "basic content
// safety" business rule): a hard length limit, text-only. Mirrors the DB
// column cap (messages.schema.ts's varchar(1000)) so a request is rejected
// with a clear 400 before ever reaching the DB constraint.
export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(1000, 'Message is too long'),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const listMessagesQuerySchema = z.object({
  since: z.coerce.date().optional(),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
