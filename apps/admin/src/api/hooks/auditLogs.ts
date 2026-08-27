import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../client';
import type { AuditLogRow } from '../types';

export function useAuditLogs() {
  return useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => apiRequest<AuditLogRow[]>('/admin/audit-logs'),
  });
}
