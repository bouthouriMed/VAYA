import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { getDatabase } from '../../../lib/database.js';
import { ForbiddenError, NotFoundError, ConflictError } from '../../../lib/errors.js';
import {
  getConversationByBookingId,
  listMessages,
  sendMessage,
} from '../conversations.service.js';

type Database = ReturnType<typeof getDatabase>;

const mocks = vi.hoisted(() => ({ notifyBestEffort: vi.fn() }));
vi.mock('../../notifications/notifications.service.js', () => ({
  notifyBestEffort: mocks.notifyBestEffort,
}));

const RIDER_ID = 'rider-1';
const DRIVER_USER_ID = 'driver-1';
const OUTSIDER_ID = 'outsider-1';
const BOOKING_ID = 'booking-1';
const CONVERSATION_ID = 'conversation-1';

interface FakeBooking {
  id: string;
  riderId: string;
  ride: {
    originLabel: string;
    destinationLabel: string;
    departureAt: Date;
    status: string;
    driverProfile: {
      userId: string;
      verificationStatus: string;
      user: { id: string; fullName: string; avatarUrl: string | null };
    };
  };
  rider: { id: string; fullName: string; avatarUrl: string | null };
  trip: { status: string } | null;
}

function makeBooking(overrides: Partial<FakeBooking> = {}): FakeBooking {
  return {
    id: BOOKING_ID,
    riderId: RIDER_ID,
    ride: {
      originLabel: 'Fake Origin',
      destinationLabel: 'Fake Dest',
      departureAt: new Date('2026-01-01T10:00:00Z'),
      status: 'published',
      driverProfile: {
        userId: DRIVER_USER_ID,
        verificationStatus: 'approved',
        user: { id: DRIVER_USER_ID, fullName: 'Fake Driver', avatarUrl: null },
      },
    },
    rider: { id: RIDER_ID, fullName: 'Fake Rider', avatarUrl: null },
    trip: { status: 'scheduled' },
    ...overrides,
  };
}

/**
 * Genuinely unit-level, mirroring notification-dispatch.worker.test.ts's
 * discipline: a hand-built fake exposing only the query/update/insert shape
 * conversations.service.ts actually calls — nothing here talks to a real
 * database. This is what proves the authorization rule (only the booking's
 * two parties may read/write, checked on every call, not just at creation)
 * in isolation from any DB/network concern. The full real-Postgres
 * lifecycle (accept -> conversation created -> messages -> trip completed
 * -> read-only) is covered separately by conversations.integration.test.ts.
 */
function makeFakeDb(options: {
  conversation?: {
    id: string;
    bookingId: string;
    status: 'open' | 'closed';
    driverLastReadAt?: Date | null;
    riderLastReadAt?: Date | null;
  };
  booking?: FakeBooking;
  lastMessage?: unknown;
  messages?: unknown[];
  insertedMessage?: {
    id: string;
    conversationId: string;
    senderUserId: string;
    body: string;
    createdAt: Date;
  };
}): { db: Database; updateCalls: unknown[] } {
  const updateCalls: unknown[] = [];

  const db = {
    query: {
      conversations: {
        findFirst: async () => options.conversation,
      },
      bookings: {
        findFirst: async () => options.booking,
      },
      messages: {
        findFirst: async () => options.lastMessage ?? null,
        findMany: async () => options.messages ?? [],
      },
    },
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          updateCalls.push(values);
          return undefined;
        },
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => (options.insertedMessage ? [options.insertedMessage] : []),
      }),
    }),
  } as unknown as Database;

  return { db, updateCalls };
}

beforeEach(() => {
  mocks.notifyBestEffort.mockReset();
});

describe('conversations.service — authorization', () => {
  it('getConversationByBookingId throws NotFoundError when the booking does not exist', async () => {
    const { db } = makeFakeDb({ booking: undefined });
    await expect(getConversationByBookingId(db, BOOKING_ID, RIDER_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('getConversationByBookingId rejects a user who is neither the rider nor the driver', async () => {
    const { db } = makeFakeDb({
      booking: makeBooking(),
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
    });
    await expect(
      getConversationByBookingId(db, BOOKING_ID, OUTSIDER_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('getConversationByBookingId allows the rider', async () => {
    const { db } = makeFakeDb({
      booking: makeBooking(),
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
    });
    const conversation = await getConversationByBookingId(db, BOOKING_ID, RIDER_ID);
    expect(conversation.id).toBe(CONVERSATION_ID);
  });

  it('getConversationByBookingId allows the driver', async () => {
    const { db } = makeFakeDb({
      booking: makeBooking(),
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
    });
    const conversation = await getConversationByBookingId(db, BOOKING_ID, DRIVER_USER_ID);
    expect(conversation.id).toBe(CONVERSATION_ID);
  });

  it('getConversationByBookingId throws NotFoundError when no conversation exists yet for the booking', async () => {
    const { db } = makeFakeDb({ booking: makeBooking(), conversation: undefined });
    await expect(getConversationByBookingId(db, BOOKING_ID, RIDER_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('listMessages rejects a third party on every call, not just at conversation creation', async () => {
    const { db } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking(),
    });
    await expect(listMessages(db, CONVERSATION_ID, OUTSIDER_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('sendMessage rejects a third party', async () => {
    const { db } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking(),
    });
    await expect(
      sendMessage(db, CONVERSATION_ID, OUTSIDER_ID, { body: 'hi' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mocks.notifyBestEffort).not.toHaveBeenCalled();
  });
});

describe('conversations.service — read-only enforcement', () => {
  it('sendMessage throws ConflictError once the trip has reached a terminal state', async () => {
    const { db } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking({ trip: { status: 'completed' } }),
    });
    await expect(
      sendMessage(db, CONVERSATION_ID, RIDER_ID, { body: 'too late' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.notifyBestEffort).not.toHaveBeenCalled();
  });

  it.each(['completed', 'no_show', 'cancelled'])(
    'treats trip status "%s" as terminal',
    async (status) => {
      const { db } = makeFakeDb({
        conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
        booking: makeBooking({ trip: { status } }),
      });
      await expect(
        sendMessage(db, CONVERSATION_ID, RIDER_ID, { body: 'x' }),
      ).rejects.toBeInstanceOf(ConflictError);
    },
  );

  it('still allows reading messages after the conversation has closed', async () => {
    const { db } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking({ trip: { status: 'completed' } }),
      messages: [
        { id: 'm1', conversationId: CONVERSATION_ID, senderUserId: RIDER_ID, body: 'hi' },
      ],
    });
    const messages = await listMessages(db, CONVERSATION_ID, RIDER_ID);
    expect(messages).toHaveLength(1);
  });

  it('allows sending while the trip is still active (non-terminal)', async () => {
    const insertedMessage = {
      id: 'm2',
      conversationId: CONVERSATION_ID,
      senderUserId: RIDER_ID,
      body: 'still going',
      createdAt: new Date(),
    };
    const { db } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking({ trip: { status: 'active' } }),
      insertedMessage,
    });
    const message = await sendMessage(db, CONVERSATION_ID, RIDER_ID, { body: 'still going' });
    expect(message).toEqual(insertedMessage);
  });
});

describe('conversations.service — unread state', () => {
  it('reports hasUnread when the other party sent the last message and the viewer never read it', async () => {
    const { db } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking(),
      lastMessage: {
        id: 'm1',
        conversationId: CONVERSATION_ID,
        senderUserId: DRIVER_USER_ID,
        body: 'hi',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    });
    const conversation = await getConversationByBookingId(db, BOOKING_ID, RIDER_ID);
    expect(conversation.hasUnread).toBe(true);
  });

  it('reports no unread once the viewer has read past the last message', async () => {
    const { db } = makeFakeDb({
      conversation: {
        id: CONVERSATION_ID,
        bookingId: BOOKING_ID,
        status: 'open',
        riderLastReadAt: new Date('2026-01-03T00:00:00Z'),
      },
      booking: makeBooking(),
      lastMessage: {
        id: 'm1',
        conversationId: CONVERSATION_ID,
        senderUserId: DRIVER_USER_ID,
        body: 'hi',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    });
    const conversation = await getConversationByBookingId(db, BOOKING_ID, RIDER_ID);
    expect(conversation.hasUnread).toBe(false);
  });

  it('never reports unread for a message the viewer sent themselves', async () => {
    const { db } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking(),
      lastMessage: {
        id: 'm1',
        conversationId: CONVERSATION_ID,
        senderUserId: RIDER_ID,
        body: 'my own message',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    });
    const conversation = await getConversationByBookingId(db, BOOKING_ID, RIDER_ID);
    expect(conversation.hasUnread).toBe(false);
  });

  it('reports no unread when there are no messages at all yet', async () => {
    const { db } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking(),
      lastMessage: null,
    });
    const conversation = await getConversationByBookingId(db, BOOKING_ID, RIDER_ID);
    expect(conversation.hasUnread).toBe(false);
  });

  it('listMessages marks the conversation read for whichever side is requesting', async () => {
    const { db, updateCalls } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking(),
      messages: [],
    });
    await listMessages(db, CONVERSATION_ID, RIDER_ID);
    expect(updateCalls).toContainEqual(
      expect.objectContaining({ riderLastReadAt: expect.any(Date) }),
    );
  });

  it('listMessages marks the driver side read when the driver is requesting', async () => {
    const { db, updateCalls } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking(),
      messages: [],
    });
    await listMessages(db, CONVERSATION_ID, DRIVER_USER_ID);
    expect(updateCalls).toContainEqual(
      expect.objectContaining({ driverLastReadAt: expect.any(Date) }),
    );
  });
});

describe('conversations.service — notification routing', () => {
  it('notifies the driver when the rider sends a message', async () => {
    const insertedMessage = {
      id: 'm3',
      conversationId: CONVERSATION_ID,
      senderUserId: RIDER_ID,
      body: 'hello',
      createdAt: new Date(),
    };
    const { db } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking(),
      insertedMessage,
    });
    await sendMessage(db, CONVERSATION_ID, RIDER_ID, { body: 'hello' });
    expect(mocks.notifyBestEffort).toHaveBeenCalledWith(
      db,
      DRIVER_USER_ID,
      'message_received',
      expect.objectContaining({ bookingId: BOOKING_ID, senderUserId: RIDER_ID }),
    );
  });

  it('notifies the rider when the driver sends a message', async () => {
    const insertedMessage = {
      id: 'm4',
      conversationId: CONVERSATION_ID,
      senderUserId: DRIVER_USER_ID,
      body: 'on my way',
      createdAt: new Date(),
    };
    const { db } = makeFakeDb({
      conversation: { id: CONVERSATION_ID, bookingId: BOOKING_ID, status: 'open' },
      booking: makeBooking(),
      insertedMessage,
    });
    await sendMessage(db, CONVERSATION_ID, DRIVER_USER_ID, { body: 'on my way' });
    expect(mocks.notifyBestEffort).toHaveBeenCalledWith(
      db,
      RIDER_ID,
      'message_received',
      expect.objectContaining({ bookingId: BOOKING_ID, senderUserId: DRIVER_USER_ID }),
    );
  });
});
