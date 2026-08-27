import { computeCorridorKey } from '@vaya/domain';
import type { getDatabase } from '../../lib/database.js';
import { analyticsEvents } from '../../db/schema/index.js';
import type { AnalyticsEventsIngestInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

/** Search-funnel + general `trackEvent` ingestion (CLAUDE.md section 8/16).
 *  A single flat insert, no synchronous validation against `rides`/`users`
 *  beyond what the auth hook already established — analytics writes must
 *  never become a reason a real user-facing action fails, and must never
 *  slow down the request that's reporting them, so this stays a plain
 *  best-effort-shaped insert (the route handler still awaits it — it's
 *  cheap — but callers on the mobile side fire-and-forget it). */
export async function ingestAnalyticsEvents(
  db: Database,
  userId: string | null,
  input: AnalyticsEventsIngestInput,
): Promise<void> {
  const rows = input.events.map((event) => ({
    eventName: event.eventName,
    userId,
    searchId: event.searchId ?? null,
    originLabel: event.originLabel ?? null,
    originLat: event.originLat ?? null,
    originLng: event.originLng ?? null,
    destinationLabel: event.destinationLabel ?? null,
    destinationLat: event.destinationLat ?? null,
    destinationLng: event.destinationLng ?? null,
    corridorKey:
      event.originLabel || event.destinationLabel || event.originLat != null
        ? computeCorridorKey(
            { label: event.originLabel, lat: event.originLat, lng: event.originLng },
            { label: event.destinationLabel, lat: event.destinationLat, lng: event.destinationLng },
          )
        : null,
    desiredDepartureAt: event.desiredDepartureAt ? new Date(event.desiredDepartureAt) : null,
    seats: event.seats ?? null,
    resultCount: event.resultCount ?? null,
    matchTier: event.matchTier ?? null,
    selectedRideId: event.selectedRideId ?? null,
    durationMs: event.durationMs ?? null,
    metadata: event.metadata ?? {},
  }));

  await db.insert(analyticsEvents).values(rows);
}
