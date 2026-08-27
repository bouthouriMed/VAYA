import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../client';
import type { Paginated, ReportRow, ReportStatus } from '../types';

export function useReportsList(params: { page: number; limit: number; status?: string }) {
  return useQuery({
    queryKey: ['reports', params],
    queryFn: () => apiRequest<Paginated<ReportRow>>('/admin/reports', { params }),
    placeholderData: (prev) => prev,
  });
}

export function useUpdateReport(reportId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: ReportStatus; resolutionNotes?: string }) =>
      apiRequest<ReportRow>(`/admin/reports/${reportId}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}
