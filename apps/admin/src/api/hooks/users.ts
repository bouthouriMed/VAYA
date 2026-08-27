import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../client';
import type { Paginated, UserDetailResult, UserRow } from '../types';

export function useUsersList(params: { page: number; limit: number; q?: string }) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => apiRequest<Paginated<UserRow>>('/admin/users', { params }),
    placeholderData: (prev) => prev,
  });
}

export function useUserDetail(userId: string | undefined) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => apiRequest<UserDetailResult>(`/admin/users/${userId}`),
    enabled: !!userId,
  });
}

export function useSuspendUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      apiRequest<UserRow>(`/admin/users/${userId}/suspend`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user', userId] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useReactivateUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<UserRow>(`/admin/users/${userId}/reactivate`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user', userId] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useRestrictDriver(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      apiRequest(`/admin/users/${userId}/restrict-driver`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user', userId] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUnrestrictDriver(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest(`/admin/users/${userId}/unrestrict-driver`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user', userId] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
