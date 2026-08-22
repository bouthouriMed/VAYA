ALTER TABLE "bookings" ADD COLUMN "dropoff_stop_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "dropoff_label" varchar(140);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "dropoff_lat" double precision;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "dropoff_lng" double precision;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_dropoff_stop_id_route_stops_id_fk" FOREIGN KEY ("dropoff_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_dropoff_stop_id_idx" ON "bookings" USING btree ("dropoff_stop_id");