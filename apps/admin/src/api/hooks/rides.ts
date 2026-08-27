import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../client';
import type { Paginated, RideRow } from '../types';

export function useRidesList(params: { page: number; limit: number; status?: string; q?: string }) {
  return useQuery({
    queryKey: ['rides', params],
    queryFn: () => apiRequest<Paginated<RideRow>>('/admin/rides', { params }),
    placeholderData: (prev) => prev,
  });
}

export function useRideDetail(rideId: string | undefined) {
  return useQuery({
    queryKey: ['ride', rideId],
    queryFn: () => apiRequest<RideRow>(`/admin/rides/${rideId}`),
    enabled: !!rideId,
  });
}

export function useCancelRide(rideId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      apiRequest<RideRow>(`/admin/rides/${rideId}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ride', rideId] });
      void queryClient.invalidateQueries({ queryKey: ['rides'] });
    },
  });
}
