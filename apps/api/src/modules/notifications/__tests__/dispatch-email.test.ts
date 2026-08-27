import { describe, it, expect, vi, afterEach } from 'vitest';
import type { getDatabase } from '../../../lib/database.js';

type Database = ReturnType<typeof getDatabase>;

const sendEmail = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../lib/email/index.js', () => ({
  getEmailProvider: () => ({ sendEmail }),
}));

const { dispatchEmailForNotification } = await import('../notifications.service.js');

/**
 * Mirrors notification-dispatch.worker.test.ts's fake-DB discipline for
 * dispatchPushForNotification: a hand-built fake exposing only the query
 * methods this function actually calls, and the real send call is mocked
 * (here, the EmailProvider module rather than global.fetch, since
 * getEmailProvider() is an indirection dispatchEmailForNotification goes
 * through rather than calling fetch directly).
 */
function makeFakeDb(
  notification: { id: string; userId: string; type: string; payload: unknown } | undefined,
  user: { id: string; email: string | null } | undefined,
): Database {
  return {
    query: {
      notifications: { findFirst: async () => notification },
      users: { findFirst: async () => user },
    },
  } as unknown as Database;
}

const NOTIFICATION_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

describe('dispatchEmailForNotification', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends an email for an emailable event type when the user has an email on file', async () => {
    const db = makeFakeDb(
      {
        id: NOTIFICATION_ID,
        userId: USER_ID,
        type: 'booking_accepted',
        payload: { driverName: 'Karim', originLabel: 'Tunis', destinationLabel: 'Sfax' },
      },
      { id: USER_ID, email: 'rider@example.com' },
    );

    await dispatchEmailForNotification(db, NOTIFICATION_ID);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [message] = sendEmail.mock.calls[0]!;
    expect(message.to).toBe('rider@example.com');
    expect(message.subject).toContain('confirmée');
  });

  it('is a no-op when the user has no email on file', async () => {
    const db = makeFakeDb(
      { id: NOTIFICATION_ID, userId: USER_ID, type: 'booking_accepted', payload: {} },
      { id: USER_ID, email: null },
    );

    await dispatchEmailForNotification(db, NOTIFICATION_ID);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('is a no-op for event types with no email template', async () => {
    const db = makeFakeDb(
      { id: NOTIFICATION_ID, userId: USER_ID, type: 'trip_completed', payload: {} },
      { id: USER_ID, email: 'user@example.com' },
    );

    await dispatchEmailForNotification(db, NOTIFICATION_ID);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('is a no-op for a not-yet-confirmed booking_cancelled (a withdrawn request, not a confirmed cancellation)', async () => {
    const db = makeFakeDb(
      {
        id: NOTIFICATION_ID,
        userId: USER_ID,
        type: 'booking_cancelled',
        payload: { wasConfirmed: false, recipientRole: 'driver' },
      },
      { id: USER_ID, email: 'driver@example.com' },
    );

    await dispatchEmailForNotification(db, NOTIFICATION_ID);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('resolves without throwing when the notification row no longer exists', async () => {
    const db = makeFakeDb(undefined, undefined);
    await expect(dispatchEmailForNotification(db, NOTIFICATION_ID)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('throws when the email provider fails — this is what lets BullMQ retry the job', async () => {
    sendEmail.mockRejectedValueOnce(new Error('Resend API responded with HTTP 500'));
    const db = makeFakeDb(
      { id: NOTIFICATION_ID, userId: USER_ID, type: 'booking_accepted', payload: {} },
      { id: USER_ID, email: 'rider@example.com' },
    );

    await expect(dispatchEmailForNotification(db, NOTIFICATION_ID)).rejects.toThrow(/500/);
  });
});
