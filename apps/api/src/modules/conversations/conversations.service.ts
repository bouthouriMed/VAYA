import { and, asc, eq, gt } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { bookings, conversations, messages } from '../../db/schema/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { SendMessageInput } from '@vaya/validation';
import { getLogger } from '../../config/logger.js';
import { notifyBestEffort } from '../notifications/notifications.service.js';

type Database = ReturnType<typeof getDatabase>;

// The trip statuses (packages/domain/src/trip/trip-status.ts) that make a
// conversation permanently read-only. A trip is created only once its
// booking is accepted (bookings.service.ts's acceptBooking), which is also
// the moment a conversation is auto-created — so every conversation always
// has an associated trip by the time this module ever loads one.
const TERMINAL_TRIP_STATUSES = new Set(['completed', 'no_show', 'cancelled']);

type BookingWithParties = Awaited<ReturnType<typeof getBookingWithPartiesOrThrow>>;

async function getBookingWithPartiesOrThrow(db: Database, bookingId: string) {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: { ride: { with: { driverProfile: true } }, trip: true },
  });
  if (!booking) throw new NotFoundError('Booking');
  return booking;
}

function assertIsParty(booking: BookingWithParties, userId: string): void {
  const isRider = booking.riderId === userId;
  const isDriver = booking.ride.driverProfile.userId === userId;
  if (!isRider && !isDriver) {
    throw new ForbiddenError('Not authorized to access this conversation');
  }
}

function isTripTerminal(tripStatus: string | undefined): boolean {
  return Boolean(tripStatus && TERMINAL_TRIP_STATUSES.has(tripStatus));
}

/**
 * Auto-creates the one conversation for a booking once it reaches
 * `accepted` — hooked into bookings.service.ts's acceptBooking, right
 * after the existing trip-row insert. One conversation per booking, never
 * per ride (docs/roadmap/phase-08-messaging.md's explicit "avoid an
 * accidental group-chat model" rationale) — `conversations.bookingId` is a
 * unique DB constraint, not just an application-level rule, so this is
 * additionally idempotent against a duplicate call.
 *
 * Best-effort like Phase 7's notifyBestEffort: a failure here must never
 * fail the accept flow that triggered it.
 */
export async function createConversationBestEffort(db: Database, bookingId: string): Promise<void> {
  try {
    const existing = await db.query.conversations.findFirst({
      where: eq(conversations.bookingId, bookingId),
    });
    if (existing) return;
    await db.insert(conversations).values({ bookingId, status: 'open' });
  } catch (err) {
    getLogger().error({ err, bookingId }, 'Failed to auto-create conversation for accepted booking');
  }
}

/**
 * Best-effort: marks a booking's conversation closed immediately when its
 * trip is cancelled (bookings.service.ts's cancelBooking). This is a cache
 * refresh, not the enforcement mechanism itself — every read/write below
 * always re-derives closed state live from the trip's actual status, so a
 * future trip-completion code path that forgets to call an equivalent hook
 * can never let a message slip through after the trip is genuinely over.
 * A no-op (not an error) when the booking never reached `accepted` and so
 * has no conversation at all.
 */
export async function closeConversationBestEffort(db: Database, bookingId: string): Promise<void> {
  try {
    await db
      .update(conversations)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(eq(conversations.bookingId, bookingId));
  } catch (err) {
    getLogger().error({ err, bookingId }, 'Failed to close conversation for cancelled booking');
  }
}

/**
 * Loads a conversation by id, enforcing party membership on this exact
 * request — not just at creation time (docs/roadmap/phase-08-messaging.md's
 * explicit business rule) — and syncing the cached `status` column against
 * the trip's live status if it's gone stale. Every conversation/message
 * endpoint below goes through this single choke point.
 */
async function getAuthorizedConversation(db: Database, conversationId: string, requestingUserId: string) {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) throw new NotFoundError('Conversation');

  const booking = await getBookingWithPartiesOrThrow(db, conversation.bookingId);
  assertIsParty(booking, requestingUserId);

  const closed = isTripTerminal(booking.trip?.status);
  if (closed && conversation.status !== 'closed') {
    await db
      .update(conversations)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
    conversation.status = 'closed';
  }

  return {
    conversation,
    booking,
    closed,
    driverUserId: booking.ride.driverProfile.userId,
  };
}

export async function getConversationByBookingId(
  db: Database,
  bookingId: string,
  requestingUserId: string,
) {
  const booking = await getBookingWithPartiesOrThrow(db, bookingId);
  assertIsParty(booking, requestingUserId);

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.bookingId, bookingId),
  });
  if (!conversation) throw new NotFoundError('Conversation');

  const closed = isTripTerminal(booking.trip?.status);
  if (closed && conversation.status !== 'closed') {
    await db
      .update(conversations)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
    conversation.status = 'closed';
  }

  return conversation;
}

export async function listMessages(
  db: Database,
  conversationId: string,
  requestingUserId: string,
  since?: Date,
) {
  const { conversation } = await getAuthorizedConversation(db, conversationId, requestingUserId);

  return db.query.messages.findMany({
    where: since
      ? and(eq(messages.conversationId, conversation.id), gt(messages.createdAt, since))
      : eq(messages.conversationId, conversation.id),
    orderBy: asc(messages.createdAt),
  });
}

export async function sendMessage(
  db: Database,
  conversationId: string,
  senderUserId: string,
  input: SendMessageInput,
) {
  const { conversation, booking, closed, driverUserId } = await getAuthorizedConversation(
    db,
    conversationId,
    senderUserId,
  );

  if (closed) {
    throw new ConflictError('This conversation is closed — the trip has ended');
  }

  const [message] = await db
    .insert(messages)
    .values({ conversationId: conversation.id, senderUserId, body: input.body })
    .returning();
  if (!message) throw new Error('Failed to send message');

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id));

  // Phase 8 extends Phase 7's dispatch mechanism with a new event type
  // rather than building a second one (CLAUDE.md engineering standards) —
  // same notifyBestEffort call bookings.service.ts already uses, so a
  // notification-row/enqueue failure can never fail the send itself.
  const recipientUserId = senderUserId === driverUserId ? booking.riderId : driverUserId;
  await notifyBestEffort(db, recipientUserId, 'message_received', {
    conversationId: conversation.id,
    bookingId: booking.id,
    messageId: message.id,
    senderUserId,
  });

  return message;
}
