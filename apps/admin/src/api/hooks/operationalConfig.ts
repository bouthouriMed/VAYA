import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../client';
import type { OperationalConfig } from '../types';

export function useOperationalConfig() {
  return useQuery({
    queryKey: ['operational-config'],
    queryFn: () => apiRequest<OperationalConfig>('/admin/operational-config'),
  });
}

export function useUpdateOperationalConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<OperationalConfig>) =>
      apiRequest<OperationalConfig>('/admin/operational-config', { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['operational-config'] });
    },
  });
}
