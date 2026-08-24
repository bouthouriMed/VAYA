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
    // Per-side read-state — a conversation has exactly two fixed parties
    // (the booking's driver and rider), so two nullable columns are
    // simpler and cheaper than a separate read-receipts table. null means
    // "never opened this conversation," not "read at the epoch" — unread
    // state is derived by comparing against lastMessage.createdAt in
    // conversations.service.ts, never stored redundantly here.
    driverLastReadAt: timestamp('driver_last_read_at', { withTimezone: true }),
    riderLastReadAt: timestamp('rider_last_read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bookingIdIdx: uniqueIndex('conversations_booking_id_idx').on(table.bookingId),
  }),
);
