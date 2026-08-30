import { sql } from 'drizzle-orm';
import type { getDatabase } from './database.js';
import { getEnv } from '../config/env.js';
import { getLogger } from '../config/logger.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * PostGIS-backed spatial helpers — the "cheap candidate generation" stage of
 * the two-stage matching architecture (Google/PostGIS location spec, Phase
 * 4/§13): push geographic filtering into the database via GiST-indexed
 * ST_DWithin queries instead of fetching every time-windowed ride and
 * haversine-filtering in Node (matching.service.ts's pre-existing approach,
 * kept as the fallback — see isPostgisEnabled below).
 *
 * NOT exercised against a live PostGIS instance in this environment (no
 * Docker/Postgres available in this sandbox) — every query here was written
 * directly against migration 0014's schema and standard PostGIS operators,
 * not verified by an actual EXPLAIN ANALYZE run. Treat as implemented, not
 * as load-tested.
 */

export function isPostgisEnabled(): boolean {
  return getEnv().POSTGIS_ENABLED;
}

interface IdRow {
  id: string;
  [key: string]: unknown;
}

/** Populates rides.route_geom from a driver's already-computed encoded
 *  polyline (Google Routes API and OSRM both emit the same Google
 *  polyline-algorithm-format, precision 5, so one call handles either
 *  provider's output identically). Called once, right after ride creation
 *  (rides.service.ts's createRide) — routePolyline is immutable afterward,
 *  so this never needs to re-run for an existing ride. A no-op, not a
 *  thrown error, when PostGIS isn't enabled or the ride has no real
 *  polyline (haversine-fallback rides) — route_geom simply stays NULL,
 *  exactly like routePolyline already does for that case. */
export async function upsertRouteGeometry(
  db: Database,
  rideId: string,
  polyline: string | null,
): Promise<void> {
  if (!polyline || !isPostgisEnabled()) return;
  try {
    await db.execute(
      sql`UPDATE rides SET route_geom = ST_LineFromEncodedPolyline(${polyline}, 5) WHERE id = ${rideId}`,
    );
  } catch (err) {
    // Never fail ride creation over a spatial-index population step — the
    // application-level route_passthrough tier (matching.service.ts) still
    // works from routePolyline alone if this silently stays NULL.
    getLogger().warn({ err, rideId }, 'Failed to populate rides.route_geom — PostGIS may be unavailable');
  }
}

/**
 * Stage-1 cheap candidate filter for the endpoint-based tiers (exact/wide/
 * closest_departure): rides whose origin AND destination both fall within
 * the given radii of the search points, already filtered by status/time
 * window entirely in SQL, ordered by proximity, capped to `limit`.
 * Returns ride ids only — matching.service.ts's existing scoring/ranking
 * code fetches full rows (with driverProfile/user relations) for just this
 * narrowed set via the existing Drizzle relational query, unchanged.
 *
 * M-081 (spec §25): deliberately NOT filtered on `seats_available` here —
 * that column is the ride's *bottleneck*-segment occupancy, not this
 * specific rider's own segment (matching.service.ts's own
 * `hasSegmentCapacity` gate, run once the rider's real implied stop pair is
 * known, is the correct place for a real capacity decision). This SQL
 * pre-filter used to also gate on `seats_available > 0`, silently
 * reintroducing the exact flat-capacity bug M-081 fixes one layer
 * earlier — a ride bottlenecked on one segment never even reached the
 * segment-aware application check. Removed; only a cheap geographic/time
 * narrowing happens here now.
 *
 * Returns null (not an empty array) on any PostGIS failure — callers must
 * treat null as "fall back to the pre-existing time-windowed full scan",
 * distinct from a genuine empty result set.
 */
export async function findCandidateRideIdsByEndpoints(
  db: Database,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  pickupRadiusM: number,
  dropoffRadiusM: number,
  windowStart: Date,
  windowEnd: Date,
  limit: number,
): Promise<string[] | null> {
  if (!isPostgisEnabled()) return null;
  try {
    const result = await db.execute<IdRow>(sql`
      SELECT id FROM rides
      WHERE status = 'published'
        AND departure_at BETWEEN ${windowStart} AND ${windowEnd}
        AND ST_DWithin(
          origin_point,
          ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography,
          ${pickupRadiusM}
        )
        AND ST_DWithin(
          destination_point,
          ST_SetSRID(ST_MakePoint(${destination.lng}, ${destination.lat}), 4326)::geography,
          ${dropoffRadiusM}
        )
      ORDER BY origin_point <-> ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography
      LIMIT ${limit}
    `);
    return result.rows.map((r) => r.id);
  } catch (err) {
    getLogger().warn({ err }, 'PostGIS endpoint candidate query failed — falling back to full scan');
    return null;
  }
}

/**
 * Stage-1 cheap candidate filter for the route_passthrough tier: rides whose
 * real route geometry (route_geom) passes within corridorWidthM of BOTH the
 * rider's origin and destination — the database-level equivalent of
 * matching.service.ts's application-level projectPointOntoRoute distance
 * test, narrowing the candidate set before that precise (and, once a
 * detour-calculation stage exists, OSRM/Google-routing-backed) evaluation
 * runs. Direction/ordering (is origin actually before destination along the
 * route) is deliberately NOT decided here — ST_DWithin only tests proximity,
 * not order; matching.service.ts's existing projectPointOntoRoute fraction
 * check still runs on the narrowed set afterward, unchanged, to decide that.
 *
 * M-081 (spec §25): also deliberately NOT filtered on `seats_available`,
 * same reasoning as `findCandidateRideIdsByEndpoints` above — a ride
 * bottlenecked on one segment must still reach `scorePassThroughCandidates`'s
 * own segment-precise `hasSegmentCapacity` gate for a genuinely free later
 * segment.
 *
 * Also newly ordered by combined proximity to both search points (was
 * `LIMIT` with no `ORDER BY` at all) — a real bug surfaced while building
 * the M-081 test above: with more corridor-qualifying rides in the table
 * than `limit`, an unordered `LIMIT` returns Postgres's arbitrary physical
 * row order, which can silently drop the rider's own best (even
 * exact-on-route) match. Same fix `findCandidateRideIdsByEndpoints` already
 * had; this query just hadn't gotten it yet.
 */
export async function findCandidateRideIdsByCorridor(
  db: Database,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  corridorWidthM: number,
  windowStart: Date,
  windowEnd: Date,
  limit: number,
): Promise<string[] | null> {
  if (!isPostgisEnabled()) return null;
  try {
    const result = await db.execute<IdRow>(sql`
      SELECT id FROM rides
      WHERE status = 'published'
        AND departure_at BETWEEN ${windowStart} AND ${windowEnd}
        AND route_geom IS NOT NULL
        AND ST_DWithin(
          route_geom,
          ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography,
          ${corridorWidthM}
        )
        AND ST_DWithin(
          route_geom,
          ST_SetSRID(ST_MakePoint(${destination.lng}, ${destination.lat}), 4326)::geography,
          ${corridorWidthM}
        )
      ORDER BY
        ST_Distance(route_geom, ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography)
        + ST_Distance(route_geom, ST_SetSRID(ST_MakePoint(${destination.lng}, ${destination.lat}), 4326)::geography)
      LIMIT ${limit}
    `);
    return result.rows.map((r) => r.id);
  } catch (err) {
    getLogger().warn({ err }, 'PostGIS corridor candidate query failed — falling back to full scan');
    return null;
  }
}

/**
 * GOVERNORATE-scale (or any large-area) search-location containment test —
 * the location-architecture spec's §7 integration point: a bounding-box
 * search anchors on area containment, not a point-radius, since a fixed
 * radius from a governorate's centroid is geometrically meaningless. Takes
 * a canonical location's bounding box directly (not a stored geometry —
 * matching the spec's deliberate bbox-not-polygon scope decision).
 */
export async function findCandidateRideIdsByBoundingBox(
  db: Database,
  field: 'origin' | 'destination',
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  windowStart: Date,
  windowEnd: Date,
  limit: number,
): Promise<string[] | null> {
  if (!isPostgisEnabled()) return null;
  const column = field === 'origin' ? sql.raw('origin_point') : sql.raw('destination_point');
  try {
    const result = await db.execute<IdRow>(sql`
      SELECT id FROM rides
      WHERE status = 'published'
        AND departure_at BETWEEN ${windowStart} AND ${windowEnd}
        AND ST_Within(
          ${column}::geometry,
          ST_MakeEnvelope(${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326)
        )
      LIMIT ${limit}
    `);
    return result.rows.map((r) => r.id);
  } catch (err) {
    getLogger().warn({ err }, 'PostGIS bounding-box candidate query failed — falling back to full scan');
    return null;
  }
}
