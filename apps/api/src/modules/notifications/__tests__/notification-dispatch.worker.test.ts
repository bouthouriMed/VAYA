import { describe, it, expect, vi, afterEach } from 'vitest';
import type { getDatabase } from '../../../lib/database.js';
import { dispatchPushForNotification } from '../notifications.service.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * Genuinely unit-level (per docs/roadmap/phase-07-notifications.md's
 * testing requirement): the DB is a hand-built fake exposing only the two
 * query methods dispatchPushForNotification actually calls, and the real
 * Expo push HTTP call is mocked via `global.fetch` — nothing here talks to
 * a real database or a real Expo server.
 */
function makeFakeDb(
  notification: { id: string; userId: string; type: string; payload: unknown } | undefined,
  tokens: { id: string; userId: string; token: string; platform: string }[],
): Database {
  return {
    query: {
      notifications: {
        findFirst: async () => notification,
      },
      deviceTokens: {
        findMany: async () => tokens,
      },
    },
  } as unknown as Database;
}

const NOTIFICATION_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

describe('dispatchPushForNotification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the Expo push API with the correct payload for a registered token', async () => {
    const db = makeFakeDb(
      {
        id: NOTIFICATION_ID,
        userId: USER_ID,
        type: 'booking_requested',
        payload: { bookingId: 'b1', rideId: 'r1' },
      },
      [{ id: 'dt1', userId: USER_ID, token: 'ExponentPushToken[abc123]', platform: 'ios' }],
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok', id: 'ticket-1' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await dispatchPushForNotification(db, NOTIFICATION_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string);
    expect(body).toHaveLength(1);
    expect(body[0].to).toBe('ExponentPushToken[abc123]');
    expect(typeof body[0].title).toBe('string');
    expect(typeof body[0].body).toBe('string');
    expect(body[0].data).toMatchObject({
      notificationId: NOTIFICATION_ID,
      type: 'booking_requested',
      bookingId: 'b1',
      rideId: 'r1',
    });
  });

  it('sends one message per registered device token', async () => {
    const db = makeFakeDb(
      { id: NOTIFICATION_ID, userId: USER_ID, type: 'booking_accepted', payload: {} },
      [
        { id: 'dt1', userId: USER_ID, token: 'ExponentPushToken[device1]', platform: 'ios' },
        { id: 'dt2', userId: USER_ID, token: 'ExponentPushToken[device2]', platform: 'android' },
      ],
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await dispatchPushForNotification(db, NOTIFICATION_ID);

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body).toHaveLength(2);
    expect(body.map((m: { to: string }) => m.to)).toEqual([
      'ExponentPushToken[device1]',
      'ExponentPushToken[device2]',
    ]);
  });

  it('is a no-op (never calls fetch) when the user has no registered device tokens', async () => {
    const db = makeFakeDb(
      { id: NOTIFICATION_ID, userId: USER_ID, type: 'booking_declined', payload: {} },
      [],
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(dispatchPushForNotification(db, NOTIFICATION_ID)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves without throwing when the notification row no longer exists', async () => {
    const db = makeFakeDb(undefined, []);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(dispatchPushForNotification(db, NOTIFICATION_ID)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the Expo push API call fails — this is what lets BullMQ retry the job', async () => {
    const db = makeFakeDb(
      { id: NOTIFICATION_ID, userId: USER_ID, type: 'booking_requested', payload: {} },
      [{ id: 'dt1', userId: USER_ID, token: 'ExponentPushToken[abc123]', platform: 'ios' }],
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network unreachable')),
    );

    await expect(dispatchPushForNotification(db, NOTIFICATION_ID)).rejects.toThrow(
      'network unreachable',
    );
  });

  it('throws when Expo responds with a non-OK HTTP status', async () => {
    const db = makeFakeDb(
      { id: NOTIFICATION_ID, userId: USER_ID, type: 'booking_requested', payload: {} },
      [{ id: 'dt1', userId: USER_ID, token: 'ExponentPushToken[abc123]', platform: 'ios' }],
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    await expect(dispatchPushForNotification(db, NOTIFICATION_ID)).rejects.toThrow(/500/);
  });
});
