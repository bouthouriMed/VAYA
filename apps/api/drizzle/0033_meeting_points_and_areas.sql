DO $$ BEGIN
 CREATE TYPE "public"."meeting_point_kind" AS ENUM('transit_station', 'bus_stop', 'louage_station', 'fuel_station', 'roundabout', 'highway_exit');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "meeting_point_kind" NOT NULL,
	"label" varchar(140) NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"source_ref" varchar(80) NOT NULL,
	"road_snapped" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "pickup_meeting_point_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "dropoff_meeting_point_id" uuid;--> statement-breakpoint
ALTER TABLE "route_stops" ADD COLUMN "kind" varchar(10) DEFAULT 'point' NOT NULL;--> statement-breakpoint
ALTER TABLE "route_stops" ADD COLUMN "radius_m" integer;--> statement-breakpoint
ALTER TABLE "operational_configs" ADD COLUMN "meeting_city_walk_weight" double precision;--> statement-breakpoint
ALTER TABLE "operational_configs" ADD COLUMN "meeting_intercity_access_weight" double precision;--> statement-breakpoint
ALTER TABLE "operational_configs" ADD COLUMN "meeting_detour_weight" double precision;--> statement-breakpoint
ALTER TABLE "operational_configs" ADD COLUMN "meeting_usage_boost_seconds" double precision;--> statement-breakpoint
ALTER TABLE "operational_configs" ADD COLUMN "meeting_area_boost_seconds" double precision;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_points_source_ref_idx" ON "meeting_points" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_points_lat_lng_idx" ON "meeting_points" USING btree ("lat","lng");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pickup_meeting_point_id_meeting_points_id_fk" FOREIGN KEY ("pickup_meeting_point_id") REFERENCES "public"."meeting_points"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_dropoff_meeting_point_id_meeting_points_id_fk" FOREIGN KEY ("dropoff_meeting_point_id") REFERENCES "public"."meeting_points"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
