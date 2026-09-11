import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../client';
import type { FailedJobsResponse } from '../types';

export function useFailedJobs(limit: number) {
  return useQuery({
    queryKey: ['queue', 'failed', limit],
    queryFn: () => apiRequest<FailedJobsResponse>('/admin/queue/failed', { params: { limit } }),
    // Failed jobs are an operational surface worth glancing at without a
    // manual refresh — matches the "watch for new problems" use case, not
    // a one-time-load list like most other admin tables.
    refetchInterval: 30_000,
  });
}

export function useRetryFailedJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      apiRequest<{ success: boolean }>(`/admin/queue/failed/${jobId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['queue', 'failed'] });
    },
  });
}
