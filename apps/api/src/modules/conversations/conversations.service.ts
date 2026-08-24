import { and, asc, desc, eq, gt, inArray, or } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import {
  bookings,
  conversations,
  driverProfiles,
  messages,
  rides,
} from '../../db/schema/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { SendMessageInput } from '@vaya/validation';
import type { RideStatus, TripStatus } from '@vaya/domain';
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

/**
 * The enriched shape both the inbox list and the single-conversation
 * endpoints return. Everything the Stitch inbox/chat chrome renders that
 * is genuinely derivable from existing rows: the other party (name/avatar
 * — already public via profiles), which side the viewer is on, the ride's
 * route/departure labels, live trip status, driver verification, and the
 * last message preview, and now (conversations.driverLastReadAt /
 * riderLastReadAt) whether the viewer has unread messages.
 */
export interface ConversationSummary {
  id: string;
  bookingId: string;
  status: 'open' | 'closed';
  createdAt: Date;
  updatedAt: Date;
  viewerRole: 'driver' | 'rider';
  otherParty: { id: string; fullName: string; avatarUrl: string | null };
  otherPartyRole: 'driver' | 'rider';
  /** True only when the other party is a driver whose verification was
   *  approved — riders have no verification pipeline to be "verified" in.
   *  Drives the inbox row's badge; never inferred from anything else. */
  isOtherPartyVerified: boolean;
  /** The underlying ride's id — lets a "Voir le trajet" link route the
   *  driver straight to their own ride-management screen (which needs a
   *  rideId, not a bookingId) instead of a generic trips-tab fallback. */
  rideId: string;
  originLabel: string;
  destinationLabel: string;
  departureAt: Date;
  rideStatus: RideStatus;
  tripStatus: TripStatus | null;
  lastMessage: {
    body: string;
    createdAt: Date;
    senderUserId: string;
  } | null;
  /** True when the last message is from the other party and postdates
   *  this viewer's own last read timestamp (null = never opened this
   *  conversation). Never true for a message the viewer sent themselves. */
  hasUnread: boolean;
}

type BookingWithContext = Awaited<ReturnType<typeof getBookingWithFullContextOrThrow>>;

async function getBookingWithFullContextOrThrow(db: Database, bookingId: string) {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: {
      ride: { with: { driverProfile: { with: { user: true } } } },
      rider: true,
      trip: true,
    },
  });
  if (!booking) throw new NotFoundError('Booking');
  return booking;
}

/** Pure mapper — both endpoints' field mapping lives here exactly once. */
function toSummary(
  conversation: typeof conversations.$inferSelect,
  booking: BookingWithContext,
  requestingUserId: string,
  lastMessage: typeof messages.$inferSelect | null,
): ConversationSummary {
  const viewerIsDriver = booking.ride.driverProfile.userId === requestingUserId;
  const viewerLastReadAt = viewerIsDriver ? conversation.driverLastReadAt : conversation.riderLastReadAt;

  return {
    id: conversation.id,
    bookingId: conversation.bookingId,
    // Derived live from the trip, like every other read path in this
    // module — the cached column is never authoritative on its own.
    status: isTripTerminal(booking.trip?.status) ? 'closed' : 'open',
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    viewerRole: viewerIsDriver ? 'driver' : 'rider',
    otherParty: viewerIsDriver
      ? {
          id: booking.rider.id,
          fullName: booking.rider.fullName,
          avatarUrl: booking.rider.avatarUrl,
        }
      : {
          id: booking.ride.driverProfile.user.id,
          fullName: booking.ride.driverProfile.user.fullName,
          avatarUrl: booking.ride.driverProfile.user.avatarUrl,
        },
    otherPartyRole: viewerIsDriver ? 'rider' : 'driver',
    isOtherPartyVerified:
      !viewerIsDriver && booking.ride.driverProfile.verificationStatus === 'approved',
    rideId: booking.ride.id,
    originLabel: booking.ride.originLabel,
    destinationLabel: booking.ride.destinationLabel,
    departureAt: booking.ride.departureAt,
    rideStatus: booking.ride.status,
    tripStatus: booking.trip?.status ?? null,
    lastMessage: lastMessage
      ? {
          body: lastMessage.body,
          createdAt: lastMessage.createdAt,
          senderUserId: lastMessage.senderUserId,
        }
      : null,
    hasUnread: Boolean(
      lastMessage &&
        lastMessage.senderUserId !== requestingUserId &&
        (!viewerLastReadAt || lastMessage.createdAt > viewerLastReadAt),
    ),
  };
}

export async function getConversationByBookingId(
  db: Database,
  bookingId: string,
  requestingUserId: string,
) {
  const [conversation, booking] = await Promise.all([
    db.query.conversations.findFirst({ where: eq(conversations.bookingId, bookingId) }),
    getBookingWithPartiesOrThrow(db, bookingId),
  ]);
  assertIsParty(booking, requestingUserId);
  if (!conversation) throw new NotFoundError('Conversation');

  if (isTripTerminal(booking.trip?.status) && conversation.status !== 'closed') {
    await db
      .update(conversations)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
  }

  const fullBooking = await getBookingWithFullContextOrThrow(db, bookingId);
  const lastMessage =
    (await db.query.messages.findFirst({
      where: eq(messages.conversationId, conversation.id),
      orderBy: [desc(messages.createdAt)],
    })) ?? null;
  return toSummary(conversation, fullBooking, requestingUserId, lastMessage);
}

/**
 * GET /conversations — every conversation whose booking the requester is a
 * party to (as rider or as the ride's driver), newest activity first.
 * Party scoping happens in the SQL itself (the OR over both membership
 * shapes), not after fetching. Summaries are hydrated with two batched
 * follow-up queries (bookings-with-context + last messages) rather than N
 * relational round-trips per row.
 */
export async function listConversations(
  db: Database,
  requestingUserId: string,
): Promise<ConversationSummary[]> {
  const rows = await db
    .select({ conversation: conversations })
    .from(conversations)
    .innerJoin(bookings, eq(bookings.id, conversations.bookingId))
    .innerJoin(rides, eq(rides.id, bookings.rideId))
    .innerJoin(driverProfiles, eq(driverProfiles.id, rides.driverProfileId))
    .where(or(eq(bookings.riderId, requestingUserId), eq(driverProfiles.userId, requestingUserId)))
    .orderBy(desc(conversations.updatedAt));

  if (rows.length === 0) return [];
  const conversationRows = rows.map((row) => row.conversation);

  const relatedBookings = await db.query.bookings.findMany({
    where: inArray(
      bookings.id,
      conversationRows.map((c) => c.bookingId),
    ),
    with: {
      ride: { with: { driverProfile: { with: { user: true } } } },
      rider: true,
      trip: true,
    },
  });
  const bookingsById = new Map(relatedBookings.map((b) => [b.id, b]));

  const lastMessages = await db.query.messages.findMany({
    where: inArray(
      messages.conversationId,
      conversationRows.map((c) => c.id),
    ),
    orderBy: [asc(messages.createdAt)],
  });
  const lastMessageByConversation = new Map<string, (typeof lastMessages)[number]>();
  for (const message of lastMessages) {
    // asc order ⇒ the last write per conversation wins.
    lastMessageByConversation.set(message.conversationId, message);
  }

  const summaries: ConversationSummary[] = [];
  for (const conversation of conversationRows) {
    const booking = bookingsById.get(conversation.bookingId);
    if (!booking) continue; // booking deleted mid-flight (cascade hasn't landed yet)

    summaries.push(
      toSummary(
        conversation,
        booking,
        requestingUserId,
        lastMessageByConversation.get(conversation.id) ?? null,
      ),
    );
  }
  return summaries;
}

/**
 * Best-effort — mirrors notifyBestEffort's contract (a failure here must
 * never fail the read the caller actually wants). Called every time
 * listMessages runs, i.e. while the viewer has the conversation screen
 * open and polling (docs/roadmap/phase-08-messaging.md's polling
 * delivery model) — "opening/viewing the thread clears its unread
 * state" is the same convention most inbox UIs use, and needs no
 * separate "mark as read" endpoint or client-side call.
 */
async function markConversationReadBestEffort(
  db: Database,
  conversationId: string,
  viewerIsDriver: boolean,
): Promise<void> {
  try {
    await db
      .update(conversations)
      .set(viewerIsDriver ? { driverLastReadAt: new Date() } : { riderLastReadAt: new Date() })
      .where(eq(conversations.id, conversationId));
  } catch (err) {
    getLogger().error({ err, conversationId }, 'Failed to mark conversation read');
  }
}

export async function listMessages(
  db: Database,
  conversationId: string,
  requestingUserId: string,
  since?: Date,
) {
  const { conversation, driverUserId } = await getAuthorizedConversation(
    db,
    conversationId,
    requestingUserId,
  );

  const rows = await db.query.messages.findMany({
    where: since
      ? and(eq(messages.conversationId, conversation.id), gt(messages.createdAt, since))
      : eq(messages.conversationId, conversation.id),
    orderBy: asc(messages.createdAt),
  });

  await markConversationReadBestEffort(db, conversation.id, requestingUserId === driverUserId);

  return rows;
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
