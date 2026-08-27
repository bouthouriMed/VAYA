// Search-funnel event names (CLAUDE.md section 8). Not a closed pgEnum on
// the API side (apps/api/src/db/schema/analytics-events.schema.ts's
// `eventName` is free text) — this constant list is the shared contract
// between the mobile instrumentation call sites and the admin dashboard's
// funnel query, kept as plain strings so a new ad-hoc `trackEvent(...)` call
// elsewhere in the app never needs a schema migration to be captured.
export const SEARCH_FUNNEL_EVENT_NAMES = [
  'search_started',
  'origin_selected',
  'destination_selected',
  'search_submitted',
  'search_results_shown',
  'search_result_selected',
  'search_no_results',
  'search_abandoned',
] as const;
export type SearchFunnelEventName = (typeof SEARCH_FUNNEL_EVENT_NAMES)[number];

export interface AnalyticsEventInput {
  eventName: string;
  searchId?: string | null;
  originLabel?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  destinationLabel?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  desiredDepartureAt?: string | null;
  seats?: number | null;
  resultCount?: number | null;
  matchTier?: string | null;
  selectedRideId?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}
