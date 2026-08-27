import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../client';
import type {
  DriverProfileRow,
  VerificationDeclineReason,
  VerificationDetailResult,
  VerificationQueueResult,
} from '../types';

export function useVerificationsQueue(params: { page: number; limit: number; status?: string }) {
  return useQuery({
    queryKey: ['verifications', params],
    queryFn: () => apiRequest<VerificationQueueResult>('/admin/verifications', { params }),
    placeholderData: (prev) => prev,
  });
}

export function useVerificationDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['verification', id],
    queryFn: () => apiRequest<VerificationDetailResult>(`/admin/verifications/${id}`),
    enabled: !!id,
  });
}

export function useApproveVerification(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notes?: string) =>
      apiRequest<DriverProfileRow>(`/admin/verifications/${id}/approve`, {
        method: 'POST',
        body: { notes },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['verification', id] });
      void queryClient.invalidateQueries({ queryKey: ['verifications'] });
    },
  });
}

export interface DeclineVerificationInput {
  outcome: 'rejected' | 'resubmission_required';
  reason: VerificationDeclineReason;
  message: string;
  notes?: string;
}

export function useDeclineVerification(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeclineVerificationInput) =>
      apiRequest<DriverProfileRow>(`/admin/verifications/${id}/decline`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['verification', id] });
      void queryClient.invalidateQueries({ queryKey: ['verifications'] });
    },
  });
}

export const DECLINE_REASON_LABELS: Record<VerificationDeclineReason, string> = {
  document_unclear: 'Document unclear / blurry',
  expired: 'Document expired',
  information_mismatch: "Information doesn't match",
  missing_document: 'Missing document',
  invalid_document: 'Invalid document type',
  additional_info_required: 'Additional information required',
  other: 'Other',
};
