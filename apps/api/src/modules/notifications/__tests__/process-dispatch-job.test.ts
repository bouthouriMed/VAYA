import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Job } from 'bullmq';
import type { getDatabase } from '../../../lib/database.js';
import type { NotificationDispatchJobData } from '../../../lib/queue.js';

type Database = ReturnType<typeof getDatabase>;

const dispatchPushForNotification = vi.fn();
const dispatchEmailForNotification = vi.fn();

vi.mock('../notifications.service.js', () => ({
  dispatchPushForNotification: (...args: unknown[]) => dispatchPushForNotification(...args),
  dispatchEmailForNotification: (...args: unknown[]) => dispatchEmailForNotification(...args),
}));

const { processNotificationDispatchJob } = await import('../notification-dispatch.worker.js');

const NOTIFICATION_ID = '11111111-1111-1111-1111-111111111111';
const db = {} as Database;
const job = { data: { notificationId: NOTIFICATION_ID } } as Job<NotificationDispatchJobData>;

describe('processNotificationDispatchJob', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs push and email dispatch for the same notification', async () => {
    dispatchPushForNotification.mockResolvedValue(undefined);
    dispatchEmailForNotification.mockResolvedValue(undefined);

    await processNotificationDispatchJob(db, job);

    expect(dispatchPushForNotification).toHaveBeenCalledWith(db, NOTIFICATION_ID);
    expect(dispatchEmailForNotification).toHaveBeenCalledWith(db, NOTIFICATION_ID);
  });

  it('still runs email dispatch even when push dispatch fails, then throws so BullMQ retries', async () => {
    dispatchPushForNotification.mockRejectedValue(new Error('expo down'));
    dispatchEmailForNotification.mockResolvedValue(undefined);

    await expect(processNotificationDispatchJob(db, job)).rejects.toThrow();
    expect(dispatchEmailForNotification).toHaveBeenCalledTimes(1);
  });

  it('still runs push dispatch even when email dispatch fails, then throws so BullMQ retries', async () => {
    dispatchPushForNotification.mockResolvedValue(undefined);
    dispatchEmailForNotification.mockRejectedValue(new Error('resend down'));

    await expect(processNotificationDispatchJob(db, job)).rejects.toThrow();
    expect(dispatchPushForNotification).toHaveBeenCalledTimes(1);
  });

  it('resolves when both channels succeed', async () => {
    dispatchPushForNotification.mockResolvedValue(undefined);
    dispatchEmailForNotification.mockResolvedValue(undefined);

    await expect(processNotificationDispatchJob(db, job)).resolves.toBeUndefined();
  });
});
