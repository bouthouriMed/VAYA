CREATE TABLE IF NOT EXISTS "route_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"label" varchar(140) NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"road_snapped" boolean DEFAULT false NOT NULL,
	"deviation_meters" integer DEFAULT 0 NOT NULL,
	"deviation_seconds" integer DEFAULT 0 NOT NULL,
	"suitability_score" double precision DEFAULT 0 NOT NULL,
	"road_class" varchar(30),
	"is_driver_selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "route_stops_ride_id_idx" ON "route_stops" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "route_stops_ride_id_is_driver_selected_idx" ON "route_stops" USING btree ("ride_id","is_driver_selected");