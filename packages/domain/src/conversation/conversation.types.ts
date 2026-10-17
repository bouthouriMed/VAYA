import type { TimestampedEntity, UUID } from '../shared/base.types';

/**
 * A conversation is scoped to exactly one booking (docs/roadmap/phase-08-messaging.md)
 * — not a ride-level group chat. It opens when the request is sent (turn-
 * limited for the passenger until acceptance, see message-turn.ts) and
 * becomes permanently read-only once the booking is resolved or the trip
 * reaches a terminal state (`completed`/`no_show`/`cancelled`), per
 * `packages/domain/src/trip/trip-status.ts`'s TRIP_STATUSES. There is no
 * transition table here (unlike ride/booking/trip status) because the
 * direction is one-way and fully derived from the trip's own authoritative
 * state — `open -> closed` only, never reopened.
 */
export const CONVERSATION_STATUSES = ['open', 'closed'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export interface Conversation extends TimestampedEntity {
  bookingId: UUID;
  status: ConversationStatus;
}

export interface Message {
  id: UUID;
  conversationId: UUID;
  senderUserId: UUID;
  body: string;
  createdAt: Date;
}
