import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

// Deliberately a single flat event table, not a per-event-type table or a
// full event-sourcing store (CLAUDE.md: "do NOT build an unnecessarily
// complex event-sourcing system"). `eventName` is free text, not a pgEnum —
// this table exists to absorb the mobile search-funnel events
// (SEARCH_STARTED..SEARCH_ABANDONED) and any future `trackEvent(name, ...)`
// call site (apps/mobile/src/services/analytics/analytics.ts) without a
// migration per new event name. Dedicated typed columns exist only for the
// dimensions the admin dashboard actually aggregates on (search funnel +
// corridor demand); everything else stays in `metadata`.
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventName: varchar('event_name', { length: 64 }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    // Client-generated id correlating every event in one search session
    // (SEARCH_STARTED -> ... -> SEARCH_RESULTS_SHOWN/SEARCH_ABANDONED) so
    // the funnel can be joined without a stateful server-side session.
    searchId: uuid('search_id'),
    originLabel: varchar('origin_label', { length: 140 }),
    originLat: doublePrecision('origin_lat'),
    originLng: doublePrecision('origin_lng'),
    destinationLabel: varchar('destination_label', { length: 140 }),
    destinationLat: doublePrecision('destination_lat'),
    destinationLng: doublePrecision('destination_lng'),
    // Normalized "origin~destination" bucket (packages/domain's
    // computeCorridorKey) — precomputed at write time so corridor
    // aggregation queries are a plain GROUP BY, not a runtime string-munge
    // over every historical row.
    corridorKey: varchar('corridor_key', { length: 300 }),
    desiredDepartureAt: timestamp('desired_departure_at', { withTimezone: true }),
    seats: integer('seats'),
    resultCount: integer('result_count'),
    matchTier: varchar('match_tier', { length: 32 }),
    selectedRideId: uuid('selected_ride_id'),
    durationMs: integer('duration_ms'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventNameCreatedAtIdx: index('analytics_events_name_created_at_idx').on(
      table.eventName,
      table.createdAt,
    ),
    corridorCreatedAtIdx: index('analytics_events_corridor_created_at_idx').on(
      table.corridorKey,
      table.createdAt,
    ),
    searchIdIdx: index('analytics_events_search_id_idx').on(table.searchId),
  }),
);
