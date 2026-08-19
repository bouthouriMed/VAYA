import { pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { bookings } from './bookings.schema';

export const conversationStatusEnum = pgEnum('conversation_status', ['open', 'closed']);

/**
 * One conversation per booking (docs/roadmap/phase-08-messaging.md) —
 * `bookingId` is unique, not just indexed, so "one conversation per
 * booking" is a real DB constraint, not just an application convention.
 * Auto-created when a booking reaches `accepted`
 * (conversations.service.ts's createConversationBestEffort, hooked into
 * bookings.service.ts's acceptBooking). `status` is a best-effort cache of
 * whether the trip has reached a terminal state — the actual read-only
 * enforcement always re-derives this live from the trip's own status
 * (packages/domain's trip-status state machine remains the single source
 * of truth; this column is never treated as authoritative on its own, see
 * conversations.service.ts).
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    status: conversationStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bookingIdIdx: uniqueIndex('conversations_booking_id_idx').on(table.bookingId),
  }),
);
