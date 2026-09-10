import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueue = {
  getFailed: vi.fn(),
  getFailedCount: vi.fn(),
  getJob: vi.fn(),
};

vi.mock('../../../lib/queue.js', () => ({
  getNotificationDispatchQueue: vi.fn(() => mockQueue),
}));

// Imported after the mock so it picks up the mocked module.
const { listFailedJobs, getFailedJobCount, retryFailedJob } = await import('../admin-queue.service.js');
const { getNotificationDispatchQueue } = await import('../../../lib/queue.js');

describe('admin-queue.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNotificationDispatchQueue).mockReturnValue(mockQueue as never);
  });

  describe('listFailedJobs', () => {
    it('maps BullMQ job objects to a plain summary shape', async () => {
      mockQueue.getFailed.mockResolvedValue([
        {
          id: 'job-1',
          name: 'dispatch',
          data: { notificationId: 'n-1' },
          failedReason: 'Expo API responded with HTTP 500',
          attemptsMade: 3,
          timestamp: 1000,
          finishedOn: 2000,
        },
      ]);

      const result = await listFailedJobs(50);

      expect(result).toEqual([
        {
          id: 'job-1',
          name: 'dispatch',
          data: { notificationId: 'n-1' },
          failedReason: 'Expo API responded with HTTP 500',
          attemptsMade: 3,
          timestamp: 1000,
          finishedOn: 2000,
        },
      ]);
      expect(mockQueue.getFailed).toHaveBeenCalledWith(0, 49);
    });

    it('returns an empty array when the queue is unavailable (no REDIS_URL)', async () => {
      vi.mocked(getNotificationDispatchQueue).mockReturnValue(null);
      const result = await listFailedJobs(50);
      expect(result).toEqual([]);
    });
  });

  describe('getFailedJobCount', () => {
    it('returns 0 when the queue is unavailable', async () => {
      vi.mocked(getNotificationDispatchQueue).mockReturnValue(null);
      expect(await getFailedJobCount()).toBe(0);
    });

    it('returns the queue-reported count otherwise', async () => {
      mockQueue.getFailedCount.mockResolvedValue(7);
      expect(await getFailedJobCount()).toBe(7);
    });
  });

  describe('retryFailedJob', () => {
    it('calls retry() on the found job', async () => {
      const retry = vi.fn();
      mockQueue.getJob.mockResolvedValue({ retry });

      await retryFailedJob('job-1');

      expect(mockQueue.getJob).toHaveBeenCalledWith('job-1');
      expect(retry).toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown job id', async () => {
      mockQueue.getJob.mockResolvedValue(undefined);
      await expect(retryFailedJob('missing')).rejects.toThrow();
    });

    it('throws when the queue is unavailable', async () => {
      vi.mocked(getNotificationDispatchQueue).mockReturnValue(null);
      await expect(retryFailedJob('job-1')).rejects.toThrow();
    });
  });
});
