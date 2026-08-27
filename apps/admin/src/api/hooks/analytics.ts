import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../client';
import type { CorridorDemandRow, OverviewMetrics, SearchFunnelRow } from '../types';

export function useOverviewMetrics(days: number) {
  return useQuery({
    queryKey: ['analytics-overview', days],
    queryFn: () => apiRequest<OverviewMetrics>('/admin/analytics/overview', { params: { days } }),
  });
}

export function useCorridorDemand(days: number) {
  return useQuery({
    queryKey: ['analytics-corridors', days],
    queryFn: () => apiRequest<CorridorDemandRow[]>('/admin/analytics/corridors', { params: { days } }),
  });
}

export function useSearchFunnel(days: number) {
  return useQuery({
    queryKey: ['analytics-funnel', days],
    queryFn: () => apiRequest<SearchFunnelRow[]>('/admin/analytics/search-funnel', { params: { days } }),
  });
}
