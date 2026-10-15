import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** What kind of place a meeting point is — everyday Tunisian pickup
 *  spots a driver can pull over at and a passenger can find. */
export const meetingPointKindEnum = pgEnum('meeting_point_kind', [
  'transit_station',
  'bus_stop',
  'louage_station',
  'fuel_station',
  'roundabout',
  'highway_exit',
]);

/**
 * Places a car can actually stop on main roads, where a passenger can be
 * picked up or dropped off (docs/roadmap/phase-14-intelligent-pickup-
 * engine.md, Track D). Not tied to any ride: collected from OpenStreetMap
 * along published routes (meeting-points.service.ts) and reused by every
 * search whose ride passes by. `usageCount` grows with completed trips
 * that actually used the point (Track E).
 */
export const meetingPoints = pgTable(
  'meeting_points',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: meetingPointKindEnum('kind').notNull(),
    label: varchar('label', { length: 140 }).notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    /** Where the point came from, e.g. `osm:node/123` — one row per source
     *  feature, so a re-scan updates instead of duplicating. */
    sourceRef: varchar('source_ref', { length: 80 }).notNull(),
    roadSnapped: boolean('road_snapped').notNull().default(false),
    active: boolean('active').notNull().default(true),
    usageCount: integer('usage_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceRefIdx: uniqueIndex('meeting_points_source_ref_idx').on(table.sourceRef),
    // Bounding-box lookups around a passenger's origin/destination.
    latLngIdx: index('meeting_points_lat_lng_idx').on(table.lat, table.lng),
  }),
);
