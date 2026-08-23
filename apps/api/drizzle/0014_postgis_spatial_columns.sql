-- PostGIS spatial layer (additive only — every existing lat/lng column stays
-- exactly as-is and remains the source of truth the app reads/writes
-- normally; every column below is either a STORED GENERATED column derived
-- automatically from the existing lat/lng pair — so no application dual-
-- write is needed for points and they can never drift out of sync — or, for
-- route_geom (a LineString, which can't be derived from a lat/lng pair),
-- a plain nullable column the application populates once at ride-creation
-- time via lib/spatial.ts's upsertRouteGeometry helper.
--
-- Requires the postgis/postgis Docker image (docker/docker-compose.yml) —
-- a plain postgres:16-alpine image has no PostGIS binaries to enable.
--
-- NOT verified against a live database in this environment (no Docker/
-- Postgres available in this sandbox — see the accompanying implementation
-- report). Generated-column expressions below use only long-standing, core
-- PostGIS functions (ST_MakePoint, ST_SetSRID, the geography cast) that are
-- documented as IMMUTABLE, which PostgreSQL requires for a STORED generated
-- column — this is standard, well-established usage, but confirming it
-- applies cleanly on this exact PostGIS version needs a real migration run.

CREATE EXTENSION IF NOT EXISTS postgis;

-- rides -----------------------------------------------------------------
ALTER TABLE "rides" ADD COLUMN "origin_point" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("origin_lng", "origin_lat"), 4326)::geography) STORED;
ALTER TABLE "rides" ADD COLUMN "destination_point" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("destination_lng", "destination_lat"), 4326)::geography) STORED;
-- Not generated: decoded from routePolyline by lib/spatial.ts at ride-
-- creation time (ST_LineFromEncodedPolyline needs the raw polyline string,
-- which is fine as a generated-column *input* but the function's IMMUTABLE
-- status is less universally documented than the point constructors above —
-- populating it explicitly, once, from known-good application code is the
-- safer choice given this can't be verified against a live instance here).
ALTER TABLE "rides" ADD COLUMN "route_geom" geography(LineString, 4326);

CREATE INDEX IF NOT EXISTS "rides_origin_point_gix" ON "rides" USING GIST ("origin_point");
CREATE INDEX IF NOT EXISTS "rides_destination_point_gix" ON "rides" USING GIST ("destination_point");
CREATE INDEX IF NOT EXISTS "rides_route_geom_gix" ON "rides" USING GIST ("route_geom");

-- route_stops -------------------------------------------------------------
ALTER TABLE "route_stops" ADD COLUMN "point" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography) STORED;
CREATE INDEX IF NOT EXISTS "route_stops_point_gix" ON "route_stops" USING GIST ("point");

-- bookings ------------------------------------------------------------------
ALTER TABLE "bookings" ADD COLUMN "pickup_point" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("pickup_lng", "pickup_lat"), 4326)::geography) STORED;
-- dropoff_lat/lng are nullable (Phase 13 — a booking with no dropoff stop
-- keeps the ride's own destination) so this must handle NULL explicitly
-- rather than let ST_MakePoint(NULL, NULL) produce a degenerate point.
ALTER TABLE "bookings" ADD COLUMN "dropoff_point" geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE WHEN "dropoff_lat" IS NOT NULL AND "dropoff_lng" IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint("dropoff_lng", "dropoff_lat"), 4326)::geography
      ELSE NULL
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS "bookings_pickup_point_gix" ON "bookings" USING GIST ("pickup_point");
CREATE INDEX IF NOT EXISTS "bookings_dropoff_point_gix" ON "bookings" USING GIST ("dropoff_point");

-- demand_signals ------------------------------------------------------------
ALTER TABLE "demand_signals" ADD COLUMN "origin_point" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("origin_lng", "origin_lat"), 4326)::geography) STORED;
ALTER TABLE "demand_signals" ADD COLUMN "destination_point" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("destination_lng", "destination_lat"), 4326)::geography) STORED;

CREATE INDEX IF NOT EXISTS "demand_signals_origin_point_gix" ON "demand_signals" USING GIST ("origin_point");
CREATE INDEX IF NOT EXISTS "demand_signals_destination_point_gix" ON "demand_signals" USING GIST ("destination_point");
